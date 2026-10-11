import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarPollResult, CalendarStatus } from "./calendar.api";
import { refreshCalendarOnMount } from "./calendar-refresh";

const originalSync = "2026-10-12T00:00:00Z";
const completedSync = "2026-10-12T00:01:00Z";

function calendarStatus(input: Partial<CalendarStatus> = {}): CalendarStatus {
  return {
    connected: true,
    connectionStatus: "connected",
    provider: "google",
    calendarId: "calendar-1",
    lastSyncedAt: originalSync,
    pendingOperationCount: 0,
    openConflictCount: 0,
    ...input,
  };
}

function refreshHarness(input?: {
  result?: CalendarPollResult["status"];
  statuses?: CalendarStatus[];
  failure?: Error;
}) {
  const statuses = [...(input?.statuses ?? [calendarStatus()])];
  const calls = { requests: 0, reads: 0, waits: 0 };
  const dependencies = {
    requestPoll: async (): Promise<CalendarPollResult> => {
      calls.requests++;
      if (input?.failure) throw input.failure;

      return {
        status: input?.result ?? "queued",
        calendarId: "calendar-1",
        lastSyncedAt: originalSync,
      };
    },
    readStatus: async () => {
      calls.reads++;
      const next = statuses.length > 1 ? statuses.shift() : statuses[0];
      assert.ok(next, "A provider status fixture is required");

      return next;
    },
    wait: async () => {
      calls.waits++;
    },
  };

  return { calls, dependencies };
}

describe("calendar refresh observation", () => {
  it("waits for the completed worker pull before returning fresh events", async () => {
    const current = calendarStatus({ lastSyncedAt: completedSync });
    const { dependencies, calls } = refreshHarness({
      statuses: [calendarStatus(), current],
    });

    assert.deepEqual(
      await refreshCalendarOnMount(dependencies, new AbortController().signal),
      {
        status: "complete",
        calendarStatus: current,
      }
    );
    assert.deepEqual(calls, { requests: 1, reads: 2, waits: 1 });
  });

  it("uses a recently completed sync without waiting for another pull", async () => {
    const { dependencies, calls } = refreshHarness({ result: "fresh" });
    const result = await refreshCalendarOnMount(
      dependencies,
      new AbortController().signal
    );

    assert.equal(result.status, "complete");
    assert.equal(calls.waits, 0);
  });

  it("observes a durable request recovered after queue dispatch failed", async () => {
    const { dependencies } = refreshHarness({
      result: "deferred",
      statuses: [calendarStatus({ lastSyncedAt: completedSync })],
    });

    assert.equal(
      (await refreshCalendarOnMount(dependencies, new AbortController().signal))
        .status,
      "complete"
    );
  });

  it("surfaces a provider failure instead of reporting success", async () => {
    const { dependencies } = refreshHarness({
      statuses: [
        calendarStatus({ lastErrorCode: "google_429_rateLimitExceeded" }),
      ],
    });

    await assert.rejects(
      refreshCalendarOnMount(dependencies, new AbortController().signal),
      /Periksa koneksi di Integrasi/
    );
  });

  it("stops observation if the selected calendar changes", async () => {
    const { dependencies } = refreshHarness({
      statuses: [calendarStatus({ calendarId: "calendar-2" })],
    });

    await assert.rejects(
      refreshCalendarOnMount(dependencies, new AbortController().signal),
      /Koneksi kalender berubah/
    );
  });

  it("stops observation if the account disconnects", async () => {
    const { dependencies } = refreshHarness({
      statuses: [calendarStatus({ connected: false })],
    });

    await assert.rejects(
      refreshCalendarOnMount(dependencies, new AbortController().signal),
      /Koneksi kalender berubah/
    );
  });

  it("bounds observation when the worker never finishes", async () => {
    const { dependencies, calls } = refreshHarness();
    await assert.rejects(
      refreshCalendarOnMount(dependencies, new AbortController().signal),
      /Pastikan worker berjalan/
    );
    assert.equal(calls.reads, 60);
  });

  it("propagates failure to request the pull", async () => {
    const failure = new Error("Synthetic backend unavailable");
    const { dependencies } = refreshHarness({ failure });
    await assert.rejects(
      refreshCalendarOnMount(dependencies, new AbortController().signal),
      failure
    );
  });

  it("stops polling when leaving the page", async () => {
    const { dependencies, calls } = refreshHarness();
    const controller = new AbortController();
    dependencies.wait = async () => controller.abort();
    assert.deepEqual(
      await refreshCalendarOnMount(dependencies, controller.signal),
      { status: "cancelled" }
    );
    assert.equal(calls.reads, 1);
  });
});
