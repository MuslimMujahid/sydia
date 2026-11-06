#!/usr/bin/env bash
# Machine-wide Sydia test lock, shared by every session and worktree.
#
# E2E suites and browser testing share fixed ports (3000/3110/5000) and the
# local database, so concurrent runs from different sessions interfere. This
# lock makes them take turns: a second session prints who holds it and waits.
#
# The lock is a kernel flock, released automatically when its holder process
# exits or is killed, so an interrupted run never leaves a stale lock behind.
#
# Usage:
#   scripts/test-lock.sh <command> [args...]
#       Wait for the lock, run one command, release.
#   scripts/test-lock.sh acquire [--ttl SECONDS] [label...]
#       Wait for the lock and hold it across several commands (e.g. an
#       agent-browser session). Prints SYDIA_TEST_LOCK_TOKEN; the lease ends
#       on `release` or after the TTL (default 1800s), whichever comes first.
#   scripts/test-lock.sh release [TOKEN]
#       End your lease (TOKEN or $SYDIA_TEST_LOCK_TOKEN).
#   scripts/test-lock.sh status
#       Show whether the lock is free and who holds it.
#
# While holding a lease, prefix commands that would take the lock themselves
# with SYDIA_TEST_LOCK_TOKEN=<token> so they run inside the lease instead of
# waiting on it (e.g. `SYDIA_TEST_LOCK_TOKEN=... bun run test:e2e`).
#
# Env: SYDIA_TEST_LOCK_FILE     lock path (default /tmp/sydia-test.lock)
#      SYDIA_TEST_LOCK_TIMEOUT  max seconds to wait (default 1800; 0 = forever)
set -euo pipefail

lock_file="${SYDIA_TEST_LOCK_FILE:-/tmp/sydia-test.lock}"
owner_file="${lock_file}.owner"
token_file="${lock_file}.token"
timeout="${SYDIA_TEST_LOCK_TIMEOUT:-1800}"

log() { echo "[test-lock] $*" >&2; }

print_owner() {
  if [[ -s "$owner_file" ]]; then
    sed 's/^/[test-lock]   /' "$owner_file" >&2
  else
    log "  (owner unknown)"
  fi
}

# Wait for the lock on fd 9, reporting the current holder while waiting.
wait_for_lock() {
  flock -n 9 && return 0
  log "Another session is running tests:"
  print_owner
  log "Waiting for it to finish (timeout ${timeout}s)..."
  local started=$SECONDS
  if [[ "$timeout" == "0" ]]; then
    flock 9
  elif ! flock -w "$timeout" 9; then
    log "Gave up after ${timeout}s; the lock is still held."
    exit 75
  fi
  log "Acquired after $((SECONDS - started))s."
}

write_owner() {
  local kind=$1 holder=$2
  shift 2
  printf 'kind:   %s\nsince:  %s\nholder: %s\ncwd:    %s\ncmd:    %s\n' \
    "$kind" "$(date -Is)" "$holder" "$PWD" "$*" >"$owner_file"
}

lease_is_live_for() {
  local token=$1
  [[ -n "$token" && -s "$token_file" && "$(cat "$token_file")" == "$token" ]] || return 1
  # The lease is live only while its holder still has the lock.
  exec 8>>"$lock_file"
  if flock -n 8; then
    flock -u 8
    exec 8>&-
    return 1
  fi
  exec 8>&-
}

cmd_acquire() {
  local ttl=1800
  if [[ "${1:-}" == "--ttl" ]]; then
    ttl=${2:?--ttl needs a value in seconds}
    shift 2
  fi
  exec 9>>"$lock_file"
  wait_for_lock

  local token
  token=$(printf '%04x%04x%04x%04x' "$RANDOM" "$RANDOM" "$RANDOM" "$RANDOM")
  # The holder inherits fd 9 and with it the lock; the lock ends when the
  # holder exits (TTL reached or `release`).
  setsid sleep "$ttl" </dev/null >/dev/null 2>&1 &
  local holder=$!
  write_owner "lease, expires $(date -Is -d "+${ttl} seconds")" "$holder" "${*:-acquire}"
  (umask 077 && printf '%s\n' "$token" >"$token_file")

  echo "SYDIA_TEST_LOCK_TOKEN=$token"
  log "Lease held for up to ${ttl}s. Run 'scripts/test-lock.sh release $token' when done."
}

cmd_release() {
  local token=${1:-${SYDIA_TEST_LOCK_TOKEN:-}}
  if [[ -z "$token" ]]; then
    log "release needs a token (argument or SYDIA_TEST_LOCK_TOKEN)."
    exit 2
  fi
  if [[ ! -s "$token_file" || "$(cat "$token_file")" != "$token" ]]; then
    log "Token does not match the current lease; nothing released."
    exit 1
  fi
  local holder
  holder=$(awk '/^holder:/ {print $2}' "$owner_file" 2>/dev/null || true)
  if [[ -n "$holder" && "$(ps -o comm= -p "$holder" 2>/dev/null)" == "sleep" ]]; then
    kill "$holder"
  fi
  : >"$token_file"
  : >"$owner_file"
  log "Released."
}

cmd_status() {
  exec 9>>"$lock_file"
  if flock -n 9; then
    flock -u 9
    echo "free"
  else
    echo "held"
    print_owner
  fi
}

cmd_run() {
  if [[ $# -eq 0 ]]; then
    sed -n '2,30p' "$0" >&2
    exit 2
  fi
  if lease_is_live_for "${SYDIA_TEST_LOCK_TOKEN:-}"; then
    "$@"
    return
  fi

  exec 9>>"$lock_file"
  wait_for_lock
  : >"$token_file"
  write_owner "run" "$$" "$@"
  # Runs while fd 9 is still open, so the owner file is cleared before release.
  trap ': >"$owner_file"' EXIT

  # Close fd 9 for the child so a leftover background process cannot keep the
  # lock held after this wrapper exits.
  local status=0
  "$@" 9>&- || status=$?
  exit "$status"
}

case "${1:-}" in
  acquire) shift; cmd_acquire "$@" ;;
  release) shift; cmd_release "$@" ;;
  status) cmd_status ;;
  run) shift; cmd_run "$@" ;;
  *) cmd_run "$@" ;;
esac
