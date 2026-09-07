#!/usr/bin/env bash
# Build the go-whatsapp-web-multidevice companion binary into apps/backend/bin/gowa.
# Pins to a released tag so the operator rebuilds a reproducible artifact.
set -euo pipefail

GOWA_VERSION="${GOWA_VERSION:-v9.3.0}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="$ROOT/bin"
CACHE_DIR="${GOWA_CACHE_DIR:-$ROOT/.data/gowa-src}"

mkdir -p "$BIN_DIR"

if [ ! -d "$CACHE_DIR/.git" ]; then
  rm -rf "$CACHE_DIR"
  git clone --depth 1 --branch "$GOWA_VERSION" \
    https://github.com/aldinokemal/go-whatsapp-web-multidevice "$CACHE_DIR"
fi

( cd "$CACHE_DIR/src" && go build -o "$BIN_DIR/gowa" . )

echo "Built $BIN_DIR/gowa from go-whatsapp-web-multidevice $GOWA_VERSION"
