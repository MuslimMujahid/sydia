import { expect, test } from "bun:test";
import { runWatchdog } from "../scripts/watchdog";
import type { Health, WatchdogDependencies } from "../scripts/watchdog";

function scenario(outcomes: (Error | "ok")[]) {
  const controller = new AbortController();
  const published: Health[] = [];
  const logs: string[] = [];
  const wakeRequests: string[] = [];
  const deps: WatchdogDependencies = {
    check: async () => {
      const next = outcomes.shift();
      if (!next) throw new Error("Test fixture exhausted.");
      if (next instanceof Error) throw next;
    },
    close: async () => {},
    wait: async () => {
      if (!outcomes.length) controller.abort();
    },
    now: () => "2026-10-18T00:00:00.000Z",
    publish: async (health) => {
      published.push(health);
    },
    log: (level, message) => {
      logs.push(`${level} ${message}`);
    },
    redact: (error) => (error instanceof Error ? error.message : String(error)),
    wake: async () => {
      wakeRequests.push("wake");
    },
  };
  return { deps, controller, published, logs, wakeRequests };
}

test("persistent failures stop at the configured bound and remain visible", async () => {
  const s = scenario([new Error("network down"), new Error("network down")]);
  const result = await runWatchdog(
    s.deps,
    { intervalMs: 10_000, maxFailures: 2 },
    s.controller.signal
  );
  expect(result).toMatchObject({
    state: "failed",
    checks: 2,
    consecutiveFailures: 2,
    lastError: "network down",
  });
  expect(s.logs).toContain("ERROR connection (2/2): network down");
});

test("a frozen plugin activates the browser and verifies recovery with another round trip", async () => {
  const s = scenario([new Error("plugin tab has been frozen"), "ok"]);
  await runWatchdog(
    s.deps,
    { intervalMs: 10_000, maxFailures: 2 },
    s.controller.signal
  );
  expect(s.wakeRequests).toEqual(["wake"]);
  expect(s.published[1]).toMatchObject({
    state: "healthy",
    consecutiveFailures: 0,
    lastSuccess: "2026-10-18T00:00:00.000Z",
  });
  expect(s.published[1]?.lastError).toBeUndefined();
});

test("HTTP authentication failures stop immediately without browser recovery", async () => {
  const s = scenario([new Error("HTTP 401 Unauthorized")]);
  const result = await runWatchdog(
    s.deps,
    { intervalMs: 10_000, maxFailures: 12 },
    s.controller.signal
  );
  expect(result).toMatchObject({
    state: "failed",
    checks: 1,
    failureKind: "authentication",
  });
  expect(s.wakeRequests).toEqual([]);
});

test("a recovery error is logged and does not falsely mark the plugin healthy", async () => {
  const s = scenario([new Error("plugin suspended")]);
  s.deps.wake = async () => {
    throw new Error("No matching tab");
  };
  await runWatchdog(
    s.deps,
    { intervalMs: 10_000, maxFailures: 2 },
    s.controller.signal
  );
  expect(s.logs).toContain("ERROR Tab recovery failed: No matching tab");
  expect(s.published[0]?.state).toBe("degraded");
});

test("a single check failure returns failure without retrying", async () => {
  const s = scenario([new Error("network down")]);
  const result = await runWatchdog(
    s.deps,
    { intervalMs: 10_000, maxFailures: 12, once: true },
    s.controller.signal
  );
  expect(result).toMatchObject({ state: "failed", checks: 1 });
});
