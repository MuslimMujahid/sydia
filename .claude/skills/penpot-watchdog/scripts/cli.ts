#!/usr/bin/env bun
import { mkdir, open, rename } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { loadConnection, makeRedactor, parseOptions } from "./config";
import type { Options } from "./config";
import { controlRequest, openControl } from "./control";
import type { Snapshot } from "./control";
import { PenpotProbe } from "./probe";
import { runWatchdog } from "./watchdog";
import { wakeTab } from "./browser";

const help = `Penpot watchdog (Bun, Linux/macOS/WSL)

  bun scripts/cli.ts check|run|start|stop|status [options]

  check                   One plugin round trip; exit 0 if healthy, 1 otherwise
  run                     Run in the foreground (Ctrl+C stops)
  start                   Start a detached background worker
  stop                    Ask the running worker to stop (never kills by PID)
  status                  Show live health, or the last saved state

  --config PATH           Codex TOML containing mcp_servers.penpot
                          Default: PENPOT_WATCHDOG_CONFIG or ~/.codex/config.toml
  --server NAME           MCP server entry (default: penpot)
  --interval SECONDS      Delay between checks, below 30 (default: 10)
  --timeout SECONDS       Per MCP request timeout (default: 8)
  --max-failures COUNT    Stop after consecutive failures (default: 12)
  --session-id ID         Explicit Penpot plugin session, if supported by server
  --state-dir PATH        Separate worker state/log directory
  --cdp URL               Optional Chromium debugging HTTP endpoint
  --page-url URL          Penpot tab URL for recovery; required with --cdp

Credentials are read from TOML/environment and never written to worker state.
Browser recovery can bring the Penpot tab to the front; it never reloads it.
`;

async function wait(ms: number, signal: AbortSignal): Promise<void> {
  try {
    await delay(ms, undefined, { signal });
  } catch (error) {
    if (!signal.aborted) throw error;
  }
}

async function worker(options: Options): Promise<void> {
  const config = await loadConnection(options);
  const redact = makeRedactor(config);
  // All following diagnostics, including fatal errors, pass through the same credential filter.
  try {
    const log = (level: "INFO" | "WARN" | "ERROR", message: string) =>
      console.error(`${new Date().toISOString()} ${level} ${redact(message)}`);
    const probe = new PenpotProbe(
      config,
      options.timeoutMs,
      log,
      options.sessionId
    );
    const controller = new AbortController();
    const stop = () => controller.abort();
    let snapshot: Snapshot = {
      state: "starting",
      pid: process.pid,
      checks: 0,
      consecutiveFailures: 0,
      updatedAt: new Date().toISOString(),
    };
    let closeControl: (() => Promise<void>) | undefined;
    if (options.command !== "check") {
      await mkdir(options.stateDir, { recursive: true, mode: 0o700 });
      closeControl = await openControl(options.stateDir, () => snapshot, stop);
    }
    process.on("SIGTERM", stop);
    process.on("SIGINT", stop);
    try {
      log(
        "INFO",
        `Starting checks every ${options.intervalMs / 1000}s; stop after ${options.maxFailures} consecutive failures.`
      );
      const result = await runWatchdog(
        {
          check: (signal) => probe.check(signal),
          close: () => probe.close(),
          wake:
            options.cdpUrl && options.pageUrl
              ? (signal) =>
                  wakeTab(
                    options.cdpUrl!,
                    options.pageUrl!,
                    options.timeoutMs,
                    signal
                  )
              : undefined,
          now: () => new Date().toISOString(),
          wait,
          log,
          redact,
          publish: async (health) => {
            snapshot = {
              ...health,
              pid: process.pid,
              updatedAt: new Date().toISOString(),
            };
            if (options.command !== "check") {
              const temporary = join(
                options.stateDir,
                `status.${process.pid}.tmp`
              );
              await Bun.write(
                temporary,
                JSON.stringify(snapshot, null, 2) + "\n",
                { mode: 0o600 }
              );
              await rename(temporary, join(options.stateDir, "status.json"));
            }
          },
        },
        { ...options, once: options.command === "check" },
        controller.signal
      );
      if (result.state === "failed") {
        log(
          "ERROR",
          "Watchdog stopped. Focus/reconnect Penpot, check credentials/network, then start again."
        );
        process.exitCode = 1;
      } else log("INFO", "Watchdog stopped.");
    } finally {
      process.removeListener("SIGTERM", stop);
      process.removeListener("SIGINT", stop);
      if (closeControl) await closeControl();
    }
  } catch (error) {
    throw new Error(redact(error));
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (options.command === "help") {
    console.log(help);
    return;
  }
  if (options.command === "status" || options.command === "stop") {
    const live = await controlRequest(options.stateDir, options.command);
    if (options.command === "stop") {
      console.log(live ? "Stop requested." : "Watchdog is not running.");
    } else if (live) {
      console.log(JSON.stringify({ running: true, ...live }, null, 2));
    } else {
      const file = Bun.file(join(options.stateDir, "status.json"));
      console.log(
        JSON.stringify(
          {
            running: false,
            lastRun: (await file.exists()) ? await file.json() : null,
          },
          null,
          2
        )
      );
      process.exitCode = 1;
    }
    return;
  }
  if (options.command === "start") {
    await loadConnection(options); // Fail before detaching if credentials/configuration are missing.
    if (await controlRequest(options.stateDir, "status"))
      throw new Error("Watchdog is already running.");
    await mkdir(options.stateDir, { recursive: true, mode: 0o700 });
    const logPath = join(options.stateDir, "watchdog.log");
    const log = await open(logPath, "a", 0o600);
    const args = [
      "_worker",
      "--config",
      options.configPath,
      "--server",
      options.server,
      "--state-dir",
      options.stateDir,
      "--interval",
      String(options.intervalMs / 1000),
      "--timeout",
      String(options.timeoutMs / 1000),
      "--max-failures",
      String(options.maxFailures),
      ...(options.sessionId ? ["--session-id", options.sessionId] : []),
      ...(options.cdpUrl && options.pageUrl
        ? ["--cdp", options.cdpUrl, "--page-url", options.pageUrl]
        : []),
    ];
    // Pass configuration paths only; URL and auth stay in TOML/environment, not the process arguments.
    const child = spawn(process.execPath, [import.meta.path, ...args], {
      detached: true,
      stdio: ["ignore", log.fd, log.fd],
      env: process.env,
    });
    const exited = new Promise<never>((_, reject) => {
      child.once("error", reject);
      child.once("exit", (code) =>
        reject(new Error(`Worker exited (${code}); see ${logPath}.`))
      );
    });
    try {
      await Promise.race([
        exited,
        (async () => {
          const deadline = Date.now() + 10_000;
          while (Date.now() < deadline) {
            const status = await controlRequest(options.stateDir, "status");
            if (status) {
              console.log(
                `Watchdog started (PID ${status.pid}). Log: ${logPath}`
              );
              return;
            }
            await delay(100);
          }
          throw new Error(`Worker startup timed out; see ${logPath}.`);
        })(),
      ]);
    } finally {
      child.unref();
      await log.close();
    }
    return;
  }
  await worker(options);
}

process.umask(0o077);
main().catch((error: unknown) => {
  console.error(
    `ERROR: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
});
