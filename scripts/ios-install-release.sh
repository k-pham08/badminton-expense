#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKSPACE="$ROOT/ios/BadmintonApp.xcworkspace"
SCHEME="BadmintonApp"
BUNDLE_ID="com.khoapham.badminton-expense"
TEAM="44GB59FSW2"
APP="$HOME/Library/Developer/Xcode/DerivedData/BadmintonApp-gwkltqxbizvuxgdetugxtotdhvba/Build/Products/Release-iphoneos/BadmintonApp.app"

if [[ ! -d "$WORKSPACE" ]]; then
  echo "ios/BadmintonApp.xcworkspace not found. Run: npx expo prebuild --platform ios"
  exit 1
fi

DEVICE_ID="$(
  xcrun xctrace list devices 2>/dev/null \
    | sed -n '1,/^== Simulators ==/p' \
    | grep -v 'MacBook' \
    | sed -nE 's/.*\(([0-9A-F-]{20,})\)$/\1/p' \
    | head -n 1
)"

if [[ -z "${DEVICE_ID:-}" ]]; then
  echo "No iPhone found."
  exit 1
fi

echo "Device: $DEVICE_ID"
echo "Building Release (no debugger)..."

xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination "id=$DEVICE_ID" \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$TEAM" \
  CODE_SIGN_STYLE=Automatic

if [[ ! -d "$APP" ]]; then
  APP="$(find "$HOME/Library/Developer/Xcode/DerivedData" -path '*/Release-iphoneos/BadmintonApp.app' -type d | head -n 1)"
fi

if [[ -z "${APP:-}" || ! -d "$APP" ]]; then
  echo "BadmintonApp.app not found after build."
  exit 1
fi

echo "Installing $APP"
xcrun devicectl device install app --device "$DEVICE_ID" "$APP"
echo "Launching without debugger..."
xcrun devicectl device process launch --device "$DEVICE_ID" "$BUNDLE_ID" || true
echo
echo "Done. Open app from Home icon. You can close Xcode — app won't be killed."
