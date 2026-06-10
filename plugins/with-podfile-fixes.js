// Expo config plugin: patches the iOS Podfile during prebuild to:
//   1. Disable code-signing on resource bundle pods (Xcode 14+ requires
//      every bundle target be signed; many pods don't set DEVELOPMENT_TEAM
//      → build fails with "resource bundles are signed by default")
//   2. Force SWIFT_VERSION 5 on all pods (older expo modules trip Swift 6.2
//      strict concurrency / `weak let` errors on Xcode 26)
//
// Injected inside the existing `post_install do |installer|` block.

const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = '# --- vaibes podfile fixes ---';

const POST_INSTALL_SNIPPET = `
    ${MARKER}
    installer.pods_project.targets.each do |t|
      if t.respond_to?(:product_type) && t.product_type == 'com.apple.product-type.bundle'
        t.build_configurations.each do |c|
          c.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
          c.build_settings['CODE_SIGNING_REQUIRED'] = 'NO'
          c.build_settings['EXPANDED_CODE_SIGN_IDENTITY'] = ''
        end
      end
      t.build_configurations.each do |c|
        # Pin Swift mode + minimal concurrency so older expo modules build on
        # Xcode 26 / Swift 6.2.
        c.build_settings['SWIFT_VERSION'] = '5.0'
        c.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'
      end
    end
`.trimEnd();

module.exports = function withPodfileFixes(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      if (!fs.existsSync(podfilePath)) return cfg;
      let podfile = fs.readFileSync(podfilePath, 'utf8');

      if (podfile.includes(MARKER)) return cfg;

      // Inject just after `react_native_post_install(...)` call inside the
      // existing post_install block.
      const anchor = /react_native_post_install\([\s\S]*?\)\s*\n/;
      if (anchor.test(podfile)) {
        podfile = podfile.replace(anchor, (m) => m + POST_INSTALL_SNIPPET + '\n');
      } else {
        // Fallback: append a new post_install block at the end of the target.
        podfile = podfile.replace(
          /end\s*$/,
          `  post_install do |installer|\n${POST_INSTALL_SNIPPET}\n  end\nend\n`
        );
      }

      fs.writeFileSync(podfilePath, podfile);
      return cfg;
    },
  ]);
};
