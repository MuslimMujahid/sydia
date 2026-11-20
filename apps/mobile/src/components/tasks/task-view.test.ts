import { describe, expect, test } from "bun:test";
import type { Task } from "@/lib/services/api/tasks/tasks.api";
import {
  TASK_SECTION_LABELS,
  groupTasksBySection,
  isTaskOverdue,
  isTaskStatus,
  sortTasks,
} from "./task-view";

function task(
  id: string,
  status: Task["status"] = "inbox",
  dueAt: string | null = null,
  extra: Partial<Task> = {}
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
    ...extra,
  };
}

describe("groupTasksBySection", () => {
  test("splits inbox tasks by deadline in the web's section order", () => {
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

  test("moves a task by its optimistic status", () => {
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

  test("returns no sections for an empty list", () => {
    expect(groupTasksBySection([])).toEqual([]);
  });

  test("uses the web's section labels", () => {
    expect(TASK_SECTION_LABELS).toEqual({
      scheduled: "Terjadwal",
      unscheduled: "Belum terjadwal",
      done: "Selesai",
      cancelled: "Batal",
    });
  });
});

describe("sortTasks", () => {
  test("puts open work first, then sorts by the nearest deadline", () => {
    const later = task("later", "inbox", "2026-10-20T12:00:00.000Z");
    const sooner = task("sooner", "inbox", "2026-10-17T12:00:00.000Z");
    const noDue = task("no-due");
    const done = task("done", "done", "2026-10-10T12:00:00.000Z");

    expect(
      sortTasks([done, noDue, later, sooner], "due").map((item) => item.id)
    ).toEqual(["sooner", "later", "no-due", "done"]);
  });

  test("ranks high priority first when sorting by priority", () => {
    const low = task("low", "inbox", null, { priority: "low" });
    const high = task("high", "inbox", null, { priority: "high" });
    const medium = task("medium");

    expect(
      sortTasks([low, medium, high], "priority").map((item) => item.id)
    ).toEqual(["high", "medium", "low"]);
  });

  test("sorts titles alphabetically, ignoring case", () => {
    const tasks = [task("beli susu"), task("Antar anak"), task("cuci mobil")];

    expect(sortTasks(tasks, "title").map((item) => item.title)).toEqual([
      "Antar anak",
      "beli susu",
      "cuci mobil",
    ]);
  });
});

describe("isTaskOverdue", () => {
  const now = new Date("2026-10-16T12:00:00.000Z");

  test("flags open tasks past their deadline", () => {
    expect(
      isTaskOverdue(task("late", "inbox", "2026-10-16T11:59:00.000Z"), now)
    ).toBe(true);
    expect(
      isTaskOverdue(task("soon", "inbox", "2026-10-16T12:01:00.000Z"), now)
    ).toBe(false);
  });

  test("never flags finished tasks or tasks without a deadline", () => {
    expect(
      isTaskOverdue(task("done", "done", "2026-10-01T00:00:00.000Z"), now)
    ).toBe(false);
    expect(
      isTaskOverdue(
        task("cancelled", "cancelled", "2026-10-01T00:00:00.000Z"),
        now
      )
    ).toBe(false);
    expect(isTaskOverdue(task("open"), now)).toBe(false);
  });
});

test("rejects the removed doing status", () => {
  expect(isTaskStatus("doing")).toBe(false);
  expect(isTaskStatus("done")).toBe(true);
});
