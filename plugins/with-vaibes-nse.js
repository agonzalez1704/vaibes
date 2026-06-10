// Expo config plugin: adds an iOS Notification Service Extension target so
// pushes can attach the dynamically-generated voice mp3.
//
// On `expo prebuild` (and every EAS build) this:
//   1. Copies NotificationService.swift + Info.plist into ios/NotificationService/
//   2. Adds an Xcode app-extension target named "NotificationService"
//   3. Wires Sources + Frameworks + Resources build phases
//
// The chime sound is bundled separately via the `expo-notifications` plugin's
// `sounds` array — no need to duplicate it here.
//
// Bundle id for the extension: <main bundle id>.NotificationService

const { withXcodeProject, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const NSE_TARGET_NAME = 'NotificationService';
const NSE_BUNDLE_SUFFIX = '.NotificationService';
const SWIFT_FILE = 'NotificationService.swift';
const PLIST_FILE = 'Info.plist';
const SOURCE_DIR = path.join(__dirname, 'nse-source');

function withVaibesNSE(config) {
  // 1. Copy NSE source files into ios/NotificationService/
  config = withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const iosRoot = cfg.modRequest.platformProjectRoot;
      const targetDir = path.join(iosRoot, NSE_TARGET_NAME);
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      fs.copyFileSync(path.join(SOURCE_DIR, SWIFT_FILE), path.join(targetDir, SWIFT_FILE));
      fs.copyFileSync(path.join(SOURCE_DIR, 'NotificationService-Info.plist'), path.join(targetDir, PLIST_FILE));
      return cfg;
    },
  ]);

  // 2. Register the NSE target in the Xcode project.
  config = withXcodeProject(config, (cfg) => {
    const xcodeProject = cfg.modResults;
    const mainBundleId = cfg.ios?.bundleIdentifier;
    if (!mainBundleId) {
      console.warn('[vaibes-nse] no bundleIdentifier — skipping NSE target');
      return cfg;
    }
    const nseBundleId = mainBundleId + NSE_BUNDLE_SUFFIX;

    if (xcodeProject.pbxTargetByName(NSE_TARGET_NAME)) {
      // Already added — skip
      return cfg;
    }

    // ---- Add new app-extension target ----
    const target = xcodeProject.addTarget(NSE_TARGET_NAME, 'app_extension', NSE_TARGET_NAME);

    xcodeProject.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', target.uuid);
    xcodeProject.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid);
    xcodeProject.addBuildPhase(
      ['UserNotifications.framework'],
      'PBXFrameworksBuildPhase',
      'Frameworks',
      target.uuid
    );

    // ---- PBXGroup for the NSE files (path = NotificationService) ----
    const groupKey = xcodeProject.pbxCreateGroup(NSE_TARGET_NAME, NSE_TARGET_NAME);
    const mainGroupKey = xcodeProject.getFirstProject().firstProject.mainGroup;
    xcodeProject
      .getPBXGroupByKey(mainGroupKey)
      .children.push({ value: groupKey, comment: NSE_TARGET_NAME });

    // ---- Add files using BARE filenames so Xcode resolves them relative
    //      to the group's path (NotificationService/), not double-nested. ----
    xcodeProject.addSourceFile(SWIFT_FILE, { target: target.uuid }, groupKey);
    xcodeProject.addFile(PLIST_FILE, groupKey, {
      lastKnownFileType: 'text.plist.xml',
      target: target.uuid,
    });

    // Inherit DEVELOPMENT_TEAM from the main app target (EAS managed creds
     // set it there; the extension target also needs it explicitly).
    let mainTeamId = '';
    const targetsSection = xcodeProject.pbxNativeTargetSection();
    const mainTargetEntry = Object.entries(targetsSection).find(
      ([k, t]) => t && t.name && !k.endsWith('_comment') && t.name === cfg.modRequest.projectName
    );
    if (mainTargetEntry) {
      const mainConfigList = mainTargetEntry[1].buildConfigurationList;
      const configList = xcodeProject.pbxXCConfigurationList()[mainConfigList];
      if (configList) {
        for (const ref of configList.buildConfigurations) {
          const xcCfg = xcodeProject.pbxXCBuildConfigurationSection()[ref.value];
          if (xcCfg?.buildSettings?.DEVELOPMENT_TEAM) {
            mainTeamId = xcCfg.buildSettings.DEVELOPMENT_TEAM.replace(/"/g, '');
            break;
          }
        }
      }
    }
    // Fallback: hardcoded team ID from eas.json (only one Apple team on this account).
    if (!mainTeamId) mainTeamId = '88L8ZGW5PY';

    // ---- Build settings on every configuration of the NSE target ----
    const configurations = xcodeProject.pbxXCBuildConfigurationSection();
    Object.values(configurations).forEach((cfgSection) => {
      if (
        cfgSection.buildSettings &&
        cfgSection.buildSettings.PRODUCT_NAME === `"${NSE_TARGET_NAME}"`
      ) {
        cfgSection.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = `"${nseBundleId}"`;
        cfgSection.buildSettings.INFOPLIST_FILE = `"${NSE_TARGET_NAME}/${PLIST_FILE}"`;
        cfgSection.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '16.4';
        cfgSection.buildSettings.SWIFT_VERSION = '5.0';
        cfgSection.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
        cfgSection.buildSettings.CODE_SIGN_STYLE = 'Automatic';
        cfgSection.buildSettings.DEVELOPMENT_TEAM = mainTeamId;
        cfgSection.buildSettings.SKIP_INSTALL = 'YES';
        cfgSection.buildSettings.LD_RUNPATH_SEARCH_PATHS =
          '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"';
      }
    });

    return cfg;
  });

  return config;
}

module.exports = withVaibesNSE;
