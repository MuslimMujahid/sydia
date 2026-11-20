import { describe, expect, test } from "bun:test";
import type { Task } from "@/lib/services/api/tasks/tasks.api";
import {
  buildTaskInput,
  buildTaskUpdate,
  isTaskFormDirty,
  taskFormValues,
  validateTaskForm,
} from "./task-form";

const JAKARTA = "Asia/Jakarta";

const saved: Task = {
  id: "t1",
  title: "Beli seragam anak",
  description: "Ukuran 10",
  status: "inbox",
  priority: "high",
  dueAt: "2026-11-20T16:59:00.000Z", // 23:59 Jakarta: a day without a time
  categories: [
    {
      id: "c1",
      name: "Keluarga",
      color: "rose",
      iconKey: "family",
      taskCount: 1,
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
    },
  ],
  source: null,
  completedAt: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

describe("taskFormValues", () => {
  test("loads a saved task, reading 23:59 as no time", () => {
    expect(taskFormValues(saved, JAKARTA)).toEqual({
      title: "Beli seragam anak",
      description: "Ukuran 10",
      due: { dayKey: "2026-11-20", time: null },
      priority: "high",
      status: "inbox",
      categoryIds: ["c1"],
    });
  });

  test("starts a new task on a prefilled day, or without a due date", () => {
    expect(taskFormValues(undefined, JAKARTA, "2026-11-21").due).toEqual({
      dayKey: "2026-11-21",
      time: null,
    });
    expect(taskFormValues(undefined, JAKARTA, "not-a-day").due).toBeNull();
    expect(taskFormValues(undefined, JAKARTA).priority).toBe("medium");
  });
});

test("builds the same request body as the web editor", () => {
  expect(
    buildTaskInput(
      {
        ...taskFormValues(undefined, JAKARTA),
        title: "  Bayar SPP ",
        description: "   ",
        due: { dayKey: "2026-11-25", time: "08:00" },
        categoryIds: ["c1"],
      },
      JAKARTA
    )
  ).toEqual({
    title: "Bayar SPP",
    description: null,
    priority: "medium",
    dueAt: "2026-11-25T01:00:00.000Z",
    categoryIds: ["c1"],
  });
});

test("validates the title, notes length, and category limit", () => {
  expect(
    validateTaskForm({
      ...taskFormValues(undefined, JAKARTA),
      description: "x".repeat(4001),
      categoryIds: ["1", "2", "3", "4", "5", "6"],
    })
  ).toEqual({
    title: "Masukkan judul tugas.",
    description: "Catatan maksimal 4.000 karakter.",
    categoryIds: "Pilih maksimal 5 kategori.",
  });
});

test("only real edits count as unsaved changes", () => {
  const initial = taskFormValues(saved, JAKARTA);
  expect(
    isTaskFormDirty(initial, { ...initial, title: "Beli seragam anak " })
  ).toBe(false);
  expect(isTaskFormDirty(initial, { ...initial, priority: "low" })).toBe(true);
  expect(isTaskFormDirty(initial, { ...initial, due: null })).toBe(true);
});

test("renaming a task submits only the title to preserve a due time set on another device", () => {
  const initial = taskFormValues(saved, JAKARTA);

  expect(
    buildTaskUpdate(
      initial,
      { ...initial, title: " Seragam sekolah " },
      JAKARTA
    )
  ).toEqual({ title: "Seragam sekolah" });
});
