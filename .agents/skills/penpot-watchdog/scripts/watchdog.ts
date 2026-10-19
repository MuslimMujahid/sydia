import { classifyFailure } from "./probe";

export type Health = {
  state: "starting" | "healthy" | "degraded" | "failed" | "stopped";
  checks: number;
  consecutiveFailures: number;
  lastSuccess?: string;
  lastError?: string;
  failureKind?: string;
};

export interface WatchdogDependencies {
  check(signal: AbortSignal): Promise<void>;
  close(): Promise<void>;
  wake?: (signal: AbortSignal) => Promise<void>;
  wait(ms: number, signal: AbortSignal): Promise<void>;
  now(): string;
  publish(health: Health): Promise<void>;
  log(level: "INFO" | "WARN" | "ERROR", message: string): void;
  redact(error: unknown): string;
}

export async function runWatchdog(
  deps: WatchdogDependencies,
  options: { intervalMs: number; maxFailures: number; once?: boolean },
  signal: AbortSignal
): Promise<Health> {
  const health: Health = {
    state: "starting",
    checks: 0,
    consecutiveFailures: 0,
  };
  try {
    while (!signal.aborted) {
      health.checks++;
      try {
        await deps.check(signal);
        if (health.state !== "healthy")
          deps.log("INFO", "Penpot plugin is responding.");
        health.state = "healthy";
        health.consecutiveFailures = 0;
        health.lastSuccess = deps.now();
        delete health.lastError;
        delete health.failureKind;
      } catch (error) {
        if (signal.aborted) break;
        health.consecutiveFailures++;
        health.lastError = deps.redact(error);
        health.failureKind = classifyFailure(health.lastError);
        health.state =
          health.consecutiveFailures >= options.maxFailures || options.once
            ? "failed"
            : "degraded";
        deps.log(
          "ERROR",
          `${health.failureKind} (${health.consecutiveFailures}/${options.maxFailures}): ${health.lastError}`
        );
        await deps.close();
        if (health.failureKind === "authentication") health.state = "failed";
        if (
          health.state === "degraded" &&
          health.failureKind === "frozen" &&
          deps.wake
        ) {
          try {
            await deps.wake(signal);
            deps.log(
              "INFO",
              "Requested Penpot tab activation; the next probe will verify recovery."
            );
          } catch (wakeError) {
            deps.log("ERROR", `Tab recovery failed: ${deps.redact(wakeError)}`);
          }
        }
      }
      await deps.publish({ ...health });
      if (health.state === "failed" || options.once) return health;
      await deps.wait(options.intervalMs, signal);
    }
    health.state = "stopped";
    await deps.publish({ ...health });
    return health;
  } finally {
    await deps.close();
  }
}
