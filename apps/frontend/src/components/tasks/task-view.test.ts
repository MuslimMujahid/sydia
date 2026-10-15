// @ts-expect-error Bun supplies this module to the test runner, not the browser app.
import { describe, expect, test } from "bun:test";
import type { Task } from "../../lib/services/api/tasks/tasks.api";
import {
  groupTasksBySection,
  isTaskStatus,
  TASK_SECTION_LABELS,
} from "./task-view";

function task(
  id: string,
  status: Task["status"] = "inbox",
  dueAt: string | null = null
): Task {
  return {
    id,
    title: id,
    status,
    dueAt,
    description: null,
    priority: "medium",
    categories: [],
    source: null,
    completedAt: null,
    createdAt: "2026-10-15T00:00:00.000Z",
    updatedAt: "2026-10-15T00:00:00.000Z",
  };
}

describe("task sections", () => {
  test("splits inbox tasks by deadline in the requested section order", () => {
    const scheduled = task("scheduled", "inbox", "2026-10-16T12:00:00.000Z");
    const unscheduled = task("unscheduled");
    const done = task("done", "done");
    const cancelled = task(
      "cancelled",
      "cancelled",
      "2026-10-16T12:00:00.000Z"
    );

    expect(
      groupTasksBySection([cancelled, unscheduled, done, scheduled])
    ).toEqual([
      { key: "scheduled", tasks: [scheduled] },
      { key: "unscheduled", tasks: [unscheduled] },
      { key: "done", tasks: [done] },
      { key: "cancelled", tasks: [cancelled] },
    ]);
  });

  test("keeps overdue inbox tasks scheduled and preserves input order", () => {
    const overdue = task("overdue", "inbox", "2026-10-01T12:00:00.000Z");
    const future = task("future", "inbox", "2026-11-01T12:00:00.000Z");

    expect(groupTasksBySection([future, overdue])).toEqual([
      { key: "scheduled", tasks: [future, overdue] },
    ]);
  });

  test("uses optimistic completion and reopening when selecting sections", () => {
    const completing = task("completing", "inbox", "2026-10-16T12:00:00.000Z");
    const reopening = task("reopening", "done");

    expect(
      groupTasksBySection([completing, reopening], (item) =>
        item.id === "completing" ? "done" : "inbox"
      )
    ).toEqual([
      { key: "unscheduled", tasks: [reopening] },
      { key: "done", tasks: [completing] },
    ]);
  });

  test.each(["done", "cancelled"] as const)(
    "keeps %s tasks in their status section with or without a deadline",
    (status: "done" | "cancelled") => {
      const scheduled = task("scheduled", status, "2026-10-16T12:00:00.000Z");
      const unscheduled = task("unscheduled", status);

      expect(groupTasksBySection([scheduled, unscheduled])).toEqual([
        { key: status, tasks: [scheduled, unscheduled] },
      ]);
    }
  );

  test("uses the requested section labels", () => {
    expect(TASK_SECTION_LABELS).toEqual({
      scheduled: "Terjadwal",
      unscheduled: "Belum terjadwal",
      done: "Selesai",
      cancelled: "Batal",
    });
  });

  test("returns no sections for an empty list", () => {
    expect(groupTasksBySection([])).toEqual([]);
  });

  test("rejects the removed doing status", () => {
    expect(isTaskStatus("doing")).toBe(false);
  });
});
