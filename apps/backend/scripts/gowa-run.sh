#!/usr/bin/env bash
# Run the go-whatsapp-web-multidevice companion. The backend creates the
# connection-scoped device slot during setup and forwards inbound events to the backend's
# /whatsapp/webhook endpoint.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Read dotenv syntax as data, without executing shell expressions from .env.
# An absent .env is allowed for deployments configured entirely by the shell.
# Exported shell values take precedence over repository defaults.
if [[ -f "$ROOT/../../.env" ]]; then
  GOWA_ENV_EXPORTS="$(node - "$ROOT/../../.env" <<'NODE'
const { readFileSync } = require('node:fs');
const { parseEnv } = require('node:util');
const values = parseEnv(readFileSync(process.argv[2], 'utf8'));
for (const [key, value] of Object.entries(values)) {
  if (/^GOWA_[A-Z0-9_]+$/.test(key) && process.env[key] === undefined) {
    console.log(`export ${key}='${value.replaceAll("'", "'\\''")}'`);
  }
}
NODE
)"
  eval "$GOWA_ENV_EXPORTS"
fi

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
  --auto-download-media=false \
  --auto-mark-read=false \
  --presence-on-connect=unavailable \
  --webhook="$WEBHOOK_URL" \
  --webhook-secret="$WEBHOOK_SECRET" \
  --webhook-events=message,message.ack
