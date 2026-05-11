#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_SESSION="everdrive-backend"
FRONTEND_SESSION="everdrive-frontend"
RCLONE_SESSION="everdrive-rclone"
FRONTEND_PORT="${FRONTEND_PORT:-43117}"

if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

RCLONE_RCD_ADDR="${RCLONE_RCD_ADDR:-127.0.0.1:5572}"
RCLONE_RCD_USER="${RCLONE_RCD_USER:-admin}"
RCLONE_RCD_PASS="${RCLONE_RCD_PASS:-change_me}"
RCLONE_CMD="$(printf 'rclone rcd --rc-addr %q --rc-user %q --rc-pass %q' "$RCLONE_RCD_ADDR" "$RCLONE_RCD_USER" "$RCLONE_RCD_PASS")"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

require_cmd tmux
require_cmd tailscale
require_cmd rclone
require_cmd npm

mkdir -p "$ROOT_DIR/.run" "$FRONTEND_DIR/.run"

if [ ! -d "$ROOT_DIR/node_modules" ]; then
  (cd "$ROOT_DIR" && npm install)
fi

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  (cd "$FRONTEND_DIR" && npm install)
fi

(cd "$ROOT_DIR" && npm run prisma:generate && npm run prisma:migrate:deploy && npm run build)
(cd "$FRONTEND_DIR" && npm run build)

tmux kill-session -t "$BACKEND_SESSION" 2>/dev/null || true
tmux kill-session -t "$FRONTEND_SESSION" 2>/dev/null || true
tmux kill-session -t "$RCLONE_SESSION" 2>/dev/null || true

tmux new-session -d -s "$RCLONE_SESSION" "$RCLONE_CMD"
tmux new-session -d -s "$BACKEND_SESSION" "cd $ROOT_DIR && npm start"
tmux new-session -d -s "$FRONTEND_SESSION" "cd $FRONTEND_DIR && npm run preview -- --host 0.0.0.0 --port $FRONTEND_PORT"

sleep 3

TAILSCALE_IP="$(tailscale ip -4 | head -n 1)"

echo "tmux sessions:"
tmux ls | grep -E "$BACKEND_SESSION|$FRONTEND_SESSION|$RCLONE_SESSION" || true
echo
echo "frontend: http://$TAILSCALE_IP:$FRONTEND_PORT/"
echo "backend health: http://$TAILSCALE_IP:43107/health"
echo
curl -fsS "http://127.0.0.1:43107/health"
echo
