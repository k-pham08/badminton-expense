#!/usr/bin/env bash
# Cài culong zalo-bridge thành service systemd trên VPS Linux (Contabo/Ubuntu/Debian).
# Thay cho install-agent.sh (macOS launchd).
set -euo pipefail

DIR=$(cd "$(dirname "$0")" && pwd)
SERVICE_NAME=culong-zalo-bridge
UNIT="/etc/systemd/system/${SERVICE_NAME}.service"
LOG="/var/log/culong-zalo.log"
RUN_USER="${SUDO_USER:-$(id -un)}"

log() { printf '\033[1;36m==>\033[0m %s\n' "$1"; }
die() { printf '\033[1;31mLỗi:\033[0m %s\n' "$1" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Chạy với sudo: sudo bash $0"

command -v node >/dev/null || die "Chưa có Node. Cài Node 22+ rồi chạy lại."
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[[ "$NODE_MAJOR" -ge 20 ]] || die "Cần Node 20+, đang có $(node -v)."

log "Cài dependencies trong $DIR"
(cd "$DIR" && npm install --omit=dev)

log "Thêm log chẩn đoán cho zalo-api-final"
(cd "$DIR" && node patch-zalo-diag.mjs || true)

log "Tạo thư mục state ~/.culong cho $RUN_USER"
install -d -m 700 -o "$RUN_USER" -g "$RUN_USER" "/home/${RUN_USER}/.culong"
touch "$LOG"
chown "$RUN_USER:$RUN_USER" "$LOG"

log "Ghi systemd unit $UNIT"
cat > "$UNIT" <<EOF
[Unit]
Description=Cau Long Zalo bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${DIR}
Environment=NODE_ENV=production
ExecStart=$(command -v node) server.mjs
Restart=always
RestartSec=10
StandardOutput=append:${LOG}
StandardError=append:${LOG}

[Install]
WantedBy=multi-user.target
EOF

log "Bật và khởi động service"
systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"
sleep 2
systemctl --no-pager --lines=0 status "$SERVICE_NAME" || true

PUBLIC_IP=$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')

cat <<EOF

$(log "Xong.")

  Log:     sudo tail -f $LOG
  Token:   sudo cat /home/${RUN_USER}/.culong/zalo-bridge.json
  QR:      sudo cat /home/${RUN_USER}/.culong/zalo-qr.png > qr.png   (để tải về máy để quét)
  Host:    http://${PUBLIC_IP}:3927

$(log "Quét QR lần đầu")
1. Mở log, chờ dòng "Quét QR: ..."
2. Tải ~/.culong/zalo-qr.png về máy (scp) rồi mở bằng điện thoại.
3. Bấm Xác nhận trên điện thoại.

$(log "KHÔNG mở cổng 3927 ra Internet")
Token là Bearer token tĩnh gửi qua HTTP thường. Ai có port + token là đọc/ghi được
nhóm Zalo. Hãy dùng Tailscale hoặc WireGuard, hoặc chặn bằng firewall:

  sudo ufw allow 3927/tcp    # chỉ khi đã chắc chắn
  # an toàn hơn: ufw default deny incoming && ufw allow from <Tailscale-CIDR> to any port 3927

EOF