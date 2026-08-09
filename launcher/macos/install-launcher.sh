#!/bin/zsh
set -eu

SOURCE="$(cd "$(dirname "$0")" && pwd)/start-backend.sh"
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="$HOME/Applications/Local Auto Harmonize Launcher.app"
CONTENTS="$APP/Contents"
CONFIG_ROOT="$HOME/Library/Application Support/LocalAutoHarmonize"
mkdir -p "$CONTENTS/MacOS"
mkdir -p "$CONFIG_ROOT"
printf '%s\n' "$PROJECT_ROOT" >"$CONFIG_ROOT/project-root"
cp "$SOURCE" "$CONTENTS/MacOS/start-backend"
chmod +x "$CONTENTS/MacOS/start-backend"
cat >"$CONTENTS/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>com.local-auto-harmonize.launcher</string>
  <key>CFBundleName</key><string>Local Auto Harmonize Launcher</string>
  <key>CFBundleExecutable</key><string>start-backend</string>
  <key>CFBundleURLTypes</key><array><dict>
    <key>CFBundleURLName</key><string>Local Auto Harmonize</string>
    <key>CFBundleURLSchemes</key><array><string>localautoharmonize</string></array>
  </dict></array>
</dict></plist>
PLIST
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP"
echo "Registered localautoharmonize:// with $APP"
