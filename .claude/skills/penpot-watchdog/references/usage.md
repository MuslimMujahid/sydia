# Penpot watchdog

A standalone Bun utility that checks Penpot through MCP every ten seconds. It executes a harmless JavaScript return in the Penpot plugin, without changing the document, selection, or plugin storage. It keeps one MCP client session while healthy and reconnects after a failed probe.

This is an experimental workaround for [Penpot #11885](https://github.com/penpot/penpot/issues/11885). Penpot already has heartbeats; a browser can freeze the plugin despite a healthy network connection. Periodic calls alone do not guarantee prevention. Optional Chromium recovery activates the tab after a freeze/suspension error and verifies recovery on the next check.

## Setup

Requires Bun 1.3.14 or newer and Linux, macOS, or WSL (background controls use a Unix socket). The skill directory has its own dependencies and lockfile; it does not depend on the Sydia apps.

```bash
cd /home/bravo15/projects/sydia/.agents/skills/penpot-watchdog
bun install --frozen-lockfile
bun scripts/cli.ts check --config /path/to/.codex/config.toml
```

Keep a Penpot file open and its MCP plugin connected. The default configuration is `$CODEX_HOME/config.toml`, or `~/.codex/config.toml` when `CODEX_HOME` is unset. Set `PENPOT_WATCHDOG_CONFIG` to use another file. On WSL, pass the Windows Codex config path if that is where Penpot is configured, for example `/mnt/c/Users/bravo15/.codex/config.toml`.

The utility reads `mcp_servers.penpot.url`, `http_headers`, `env_http_headers`, and `bearer_token_env_var`. Use `--server NAME` for a different entry. Only Streamable HTTP is supported; interactive OAuth login and legacy HTTP+SSE endpoints are not supported. Existing query tokens and configured auth headers work without copying credentials into this package.

Alternatively, create a private TOML file:

```toml
[mcp_servers.penpot]
url = "https://your-penpot.example/mcp/stream?userToken=YOUR_TOKEN"
```

Keep that file outside version control and restrict its permissions (`chmod 600`). Do not pass tokens on the command line.

## Background controls

```bash
export PENPOT_WATCHDOG_CONFIG=/path/to/.codex/config.toml
bun scripts/cli.ts start
bun scripts/cli.ts status
bun scripts/cli.ts stop
```

Use `run` instead of `start` for foreground logs; Ctrl+C stops it. Use `check` for one round trip and an exit status suitable for scripts. `start` confirms that the worker is listening; use `status` to confirm that Penpot is healthy.

State and logs live in `${XDG_STATE_HOME:-~/.local/state}/penpot-watchdog/`:

- `watchdog.log`: startup, recovery, transport errors, and final failures.
- `status.json`: latest health, last success, and consecutive failure count.
- `control.sock`: local status/stop endpoint. Stop never sends a signal to a potentially recycled PID.

`status` distinguishes a running worker from saved state after it exits and returns exit code 1 when no worker is running. Use the same `--state-dir PATH` on every command to manage a separate instance. Background workers survive the launching shell, but are not installed as login/startup services. Logs append across runs; rotate them when needed.

Failures enter the visible `degraded` state. The worker stops after `--max-failures` consecutive failed checks (default 12); successful probes reset that count. Authentication errors stop immediately. Each MCP request has a timeout (default 8 seconds). Checks are sequential, with `--interval` seconds between completed checks (default 10, must be below 30). A frozen-tab recovery error is logged and counts within the same consecutive-failure bound. After fixing the cause, run `start` again.

Credentials are redacted from logs/status. A check failure can still include the server's error description, so treat logs as private. A separate watchdog MCP session cannot repair the agent's own broken MCP transport; reconnect that client if plugin checks pass but the agent still fails.

For servers that support multiple plugin sessions, use `--session-id ID` to select the desired file explicitly. If your server requires session selection, use the session ID displayed by its plugin. Older servers may not support this argument.

## Optional frozen-tab recovery

Start Chromium/Chrome with a dedicated browser profile and remote debugging, then sign in to Penpot in that browser:

```bash
google-chrome --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.local/share/penpot-watchdog-browser"
```

Start the worker with the browser debugging endpoint and the actual Penpot page URL:

```bash
bun scripts/cli.ts start \
  --cdp http://127.0.0.1:9222 \
  --page-url https://your-penpot.example/
```

Recovery only runs after a freeze/suspension error. It asks Chromium to activate the page lifecycle and bring the matching tab forward; this can change the visible tab or window focus. It never refreshes the page or clicks reconnect. Keep only one matching Penpot tab open, or pass its complete URL including hash/query to disambiguate. Browser endpoint discovery and WebSocket operations share the request timeout. When using Windows Chrome from WSL, `--cdp` must point to an address reachable from WSL; the utility does not change browser/network settings.

## Verification

```bash
bun test
bun run check-types
```

Tests cover bounded failure handling, authentication, frozen-tab recovery decisions, credential redaction, ambiguous tabs, MCP JSON/SSE responses, request timeouts, and the background start/status/stop lifecycle. Network integration tests use a local fixture, not your Penpot credentials. To evaluate the real workaround, run the worker, background the Penpot tab, and inspect `status` and logs; test optional CDP recovery separately if freezing still occurs.
