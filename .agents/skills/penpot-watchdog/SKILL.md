---
name: penpot-watchdog
description: Start, stop, inspect, or troubleshoot a background heartbeat for Penpot MCP, with optional Chromium recovery for frozen plugin tabs. Use when the user asks to use Penpot MCP.
---

# Penpot watchdog

Use the bundled standalone utility to check the full MCP-to-plugin connection without changing the Penpot document. Resolve all paths relative to this skill directory, regardless of the current working directory.

## Run the utility

The package, lockfile, TypeScript helpers in `scripts/`, and tests are self-contained. Requires Bun 1.3.14+ and Linux, macOS, or WSL. If `bun` is absent from PATH, check `$HOME/.bun/bin/bun`.

From the skill directory:

```bash
bun install --frozen-lockfile
bun scripts/cli.ts status
bun scripts/cli.ts check --config /path/to/.codex/config.toml
bun scripts/cli.ts start --config /path/to/.codex/config.toml
bun scripts/cli.ts stop
```

Install dependencies only when missing or when the lockfile changes. `status` returns exit code 1 when no worker is running; its JSON distinguishes a live worker from saved state. Reuse an existing healthy worker. `start` confirms worker startup; inspect `status` afterward to confirm the plugin is healthy. Use `run` for foreground diagnostics and `check` for a single probe.

Read the existing Penpot MCP configuration through `--config`; do not copy tokens into the skill, command arguments, or chat. Default config discovery uses `PENPOT_WATCHDOG_CONFIG`, then `$CODEX_HOME/config.toml`, then `~/.codex/config.toml`. Use `--server NAME` if the entry is not named `penpot`. In WSL, the configured server may be in the Windows Codex configuration instead. Keep the Penpot file open with its MCP plugin connected.

The default worker state directory is `${XDG_STATE_HOME:-~/.local/state}/penpot-watchdog`. Pass the same `--state-dir` to all commands when managing a separate instance. State and logs stay outside the skill. `watchdog.log` contains failures; `status.json` preserves the last health result. Stop through the CLI rather than sending signals to saved PIDs.

## Interpret failures and recovery

- Healthy probes execute a harmless return through plugin JavaScript every ten seconds. They do not edit designs, selection, or plugin storage.
- Failures are logged and enter `degraded`; twelve consecutive failures stop the worker by default. Successful checks reset the count. Authentication errors stop immediately. Inspect the reason before restarting a failed worker.
- Penpot already emits heartbeats. Browser freezing can still prevent execution, so do not claim that periodic calls guarantee prevention or that a separate watchdog repairs the agent's own MCP transport.
- Browser recovery is optional. Enable `--cdp URL --page-url URL` when requested; it activates the matching Chromium tab and can change visible focus. It never reloads the page or clicks reconnect. A successful wake request is verified by the next plugin probe.

Read [references/usage.md](references/usage.md) for supported configuration fields, Chromium setup, session selection, timeout/retry options, and detailed diagnostics. Do not require browser debugging for ordinary heartbeat mode.

After changing the utility, run from the skill directory:

```bash
bun test
bun run check-types
```

Report whether the worker is running, its current health, and any unresolved failure. When moving this skill while a worker is active, stop it before the move and restart it from the new location using the same connection and state settings.
