#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKSPACE="$ROOT/ios/CuLng.xcworkspace"
SCHEME="CuLng"
BUNDLE_ID="com.khoapham.chiatiencauLong"
TEAM="44GB59FSW2"
APP="$HOME/Library/Developer/Xcode/DerivedData/CuLng-gwkltqxbizvuxgdetugxtotdhvba/Build/Products/Release-iphoneos/CuLng.app"

if [[ ! -d "$WORKSPACE" ]]; then
  echo "Chưa có ios/CuLng.xcworkspace. Chạy: npx expo prebuild --platform ios"
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
  echo "Không thấy iPhone cắm máy."
  exit 1
fi

echo "Device: $DEVICE_ID"
echo "Building Release (không gắn debugger)..."

xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination "id=$DEVICE_ID" \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$TEAM" \
  CODE_SIGN_STYLE=Automatic

if [[ ! -d "$APP" ]]; then
  APP="$(find "$HOME/Library/Developer/Xcode/DerivedData" -path '*/Release-iphoneos/CuLng.app' -type d | head -n 1)"
fi

if [[ -z "${APP:-}" || ! -d "$APP" ]]; then
  echo "Không tìm thấy CuLng.app sau khi build."
  exit 1
fi

echo "Installing $APP"
xcrun devicectl device install app --device "$DEVICE_ID" "$APP"
echo "Launching without debugger..."
xcrun devicectl device process launch --device "$DEVICE_ID" "$BUNDLE_ID" || true
echo
echo "Xong. Mở app từ icon Home. Có thể tắt Xcode — app không bị kill."
