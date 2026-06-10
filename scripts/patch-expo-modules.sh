#!/usr/bin/env bash
# Patch expo-modules-jsi + expo-modules-core to work with Xcode 26 / Swift 6.2.
# Survives pnpm install via the package.json `postinstall` hook.
#
# Why:
#   - Xcode 26 / Swift 6.2 enforces `weak var` (not `weak let`) → expo-modules-jsi
#     `weak let runtime: JavaScriptRuntime?` fails to compile.
#   - Many of those classes are also Sendable → must mark the mutable weak
#     property `nonisolated(unsafe)` to satisfy strict concurrency.
#
# Runs from any working dir — finds the project root via $0.

set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d node_modules/.pnpm ]; then
  exit 0
fi

# weak let → weak var
find node_modules/.pnpm -path '*/expo-modules-jsi/apple/*' -name '*.swift' \
  -exec sed -i '' 's/weak let /weak var /g' {} + 2>/dev/null || true
find node_modules/.pnpm -path '*/expo-modules-core/ios/*' -name '*.swift' \
  -exec sed -i '' 's/weak let /weak var /g' {} + 2>/dev/null || true

# Prepend nonisolated(unsafe) once (idempotent).
find node_modules/.pnpm -path '*/expo-modules-jsi/apple/*' -name '*.swift' \
  -exec perl -i -pe 's/(\s*)((?:private |internal |public )?)weak var runtime: JavaScriptRuntime\?/$1${2}nonisolated(unsafe) weak var runtime: JavaScriptRuntime?/g' {} + 2>/dev/null || true
# Collapse any duplicate prefix from multiple runs.
find node_modules/.pnpm -path '*/expo-modules-jsi/apple/*' -name '*.swift' \
  -exec perl -i -pe 's/(?:nonisolated\(unsafe\)\s+){2,}/nonisolated(unsafe) /g' {} + 2>/dev/null || true

echo "[patch-expo-modules] applied"
