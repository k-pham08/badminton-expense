#!/bin/zsh
set -euo pipefail

DIR=$(cd "$(dirname "$0")" && pwd)
NODE=$(command -v node)
NPM=$(command -v npm)
PLIST="$HOME/Library/LaunchAgents/com.khoapham.culong.zalo.plist"
LABEL="com.khoapham.culong.zalo"

if [[ -z "$NODE" || -z "$NPM" ]]; then
  echo "Cần node và npm." >&2
  exit 1
fi

mkdir -p "$HOME/.culong" "$HOME/Library/LaunchAgents"
(cd "$DIR" && "$NPM" install)

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE}</string>
    <string>${DIR}/server.mjs</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${DIR}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${HOME}/.culong/zalo-bridge.log</string>
  <key>StandardErrorPath</key>
  <string>${HOME}/.culong/zalo-bridge.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/${LABEL}" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/${LABEL}"

echo "Bridge luôn chạy. Log: ~/.culong/zalo-bridge.log"
echo "Token và QR nằm trong log. Lần đầu cũng có thể chạy: npm run zalo"
if command -v ipconfig >/dev/null; then
  LAN=$(ipconfig getifaddr en0 2>/dev/null || true)
  if [[ -n "${LAN}" ]]; then
    echo "Cùng Wi-Fi: http://${LAN}:3927"
  fi
fi
if command -v tailscale >/dev/null; then
  TS=$(tailscale ip -4 2>/dev/null | head -n 1 || true)
  if [[ -n "${TS}" ]]; then
    echo "Tailscale: http://${TS}:3927"
  fi
fi
