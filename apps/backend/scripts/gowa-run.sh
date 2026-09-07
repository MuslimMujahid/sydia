#!/usr/bin/env bash
# Run the go-whatsapp-web-multidevice companion. The backend creates the
# device slot on first contact and forwards inbound events to the backend's
# /whatsapp/webhook endpoint.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${GOWA_DATA_DIR:-$ROOT/.data/gowa}"
PORT="${GOWA_PORT:-3001}"
HOST="${GOWA_HOST:-127.0.0.1}"
WEBHOOK_URL="${GOWA_WEBHOOK_URL:-http://127.0.0.1:5000/whatsapp/webhook}"
WEBHOOK_SECRET="${GOWA_WEBHOOK_SECRET:-dev-secret}"

mkdir -p "$DATA_DIR"
cd "$DATA_DIR"

exec "$ROOT/bin/gowa" rest \
  --port "$PORT" \
  --host "$HOST" \
  --db-uri "file:$DATA_DIR/whatsapp.db?_foreign_keys=on" \
  --ui-enabled=false \
  --mcp-enabled=false \
  --auto-download-media=true \
  --auto-mark-read=false \
  --presence-on-connect=unavailable \
  --webhook="$WEBHOOK_URL" \
  --webhook-secret="$WEBHOOK_SECRET" \
  --webhook-events=message,message.ack
