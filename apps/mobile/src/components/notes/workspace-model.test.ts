import { expect, test } from "bun:test";
import type {
  NoteEntry,
  WorkspaceItem,
} from "@/lib/services/api/notes/notes.api";
import {
  dailyNoteHistory,
  folderChildren,
  moveTargets,
  noteWebLink,
  trashRoots,
  validNoteRef,
} from "./workspace-model";

function item(id: string, props: Partial<WorkspaceItem> = {}): WorkspaceItem {
  return {
    id,
    title: id,
    path: id,
    kind: "folder",
    parentId: null,
    revision: 1,
    trashedAt: null,
    trashBatchId: null,
    createdAt: "",
    updatedAt: "",
    ...props,
  };
}

test("daily note references reject calendar dates that roll into the next month", () => {
  expect(validNoteRef("daily:2026-02-29")).toBe(false);
});

test("folder listings show live direct children with folders first", () => {
  const items = [
    item("A note", { kind: "note" }),
    item("A folder"),
    item("Another folder", { parentId: "A folder" }),
    item("Old folder", { trashedAt: "2026-11-19" }),
  ];

  expect(folderChildren(items, null).map((entry) => entry.id)).toEqual([
    "A folder",
    "A note",
  ]);
});

test("restoring a trash batch presents its root and separately trashed descendants", () => {
  const trash = { trashedAt: "2026-11-19", trashBatchId: "batch" };
  const items = [
    item("parent", trash),
    item("child", { ...trash, parentId: "parent" }),
    item("another", { ...trash, parentId: "parent", trashBatchId: "separate" }),
  ];

  expect(trashRoots(items).map((entry) => entry.id)).toEqual([
    "parent",
    "another",
  ]);
});

test("a folder cannot be moved underneath its own descendants", () => {
  const parent = item("parent");
  const items = [
    parent,
    item("child", { parentId: parent.id }),
    item("grandchild", { parentId: "child" }),
    item("other"),
  ];

  expect(moveTargets(items, parent).map((entry) => entry.id)).toEqual([
    "other",
  ]);
});

function dailyEntry(id: string, day: string): NoteEntry {
  return {
    id,
    ref: `daily:${day}`,
    title: day,
    path: "Catatan harian",
    kind: "daily",
    parentId: null,
    excerpt: "",
    updatedAt: "",
  };
}

test("daily history orders by calendar reference while excluding today's note", () => {
  const notes = [
    dailyEntry("z", "2026-09-19"),
    dailyEntry("a", "2026-11-18"),
    dailyEntry("c", "2026-11-19"),
  ];

  expect(
    dailyNoteHistory(notes, "2026-11-19").map((entry) => entry.day)
  ).toEqual(["2026-11-18", "2026-09-19"]);
});

test("a restore can select the live original folder", () => {
  const folder = item("parent");
  const note = item("trashed", {
    parentId: folder.id,
    kind: "note",
    trashedAt: "2026-11-19",
  });

  expect(
    moveTargets([folder, note], note, true).map((entry) => entry.id)
  ).toEqual(["parent"]);
});

test("a daily note share link opens the same calendar day on the web", () => {
  expect(
    noteWebLink("https://workspace.example.test", "daily:2026-11-18")
  ).toBe("https://workspace.example.test/notes?date=2026-11-18");
});
