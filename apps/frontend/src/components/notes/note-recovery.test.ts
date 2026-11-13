// @ts-expect-error Bun supplies this module to the test runner, not the browser app.
import { test, expect } from "bun:test";
import {
  createNoteRecoveryStore,
  type NoteRecovery,
} from "./note-recovery-store";
import { readLastNote, storeLastNote } from "./navigation-state";

function storage(entries: Array<[string, string]> = []) {
  const values = new Map(entries);

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

test("clearing the remembered selection persists an empty workspace instead of a daily note", () => {
  const browser = storage();
  storeLastNote(browser, "owner", "custom:deleted-note");
  storeLastNote(browser, "owner", null);

  expect(readLastNote(browser, "owner")).toEqual({ kind: "stored", ref: null });
});

function recovery(ref = "custom:deleted-note"): NoteRecovery {
  return {
    ref,
    requestKey: "recovery-request",
    text: "Draf saya",
    draft: {
      title: "Catatan",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Draf saya", marks: [{ type: "bold" }] },
            ],
          },
        ],
      },
    },
  };
}

test("recovery retains the rich-text document after the workspace remounts", () => {
  const browser = storage();
  createNoteRecoveryStore("owner", () => browser).add(recovery());
  const reopened = createNoteRecoveryStore("owner", () => browser);

  expect(reopened.getSnapshot().drafts).toEqual([recovery()]);
});

test("recovery drafts remain isolated by account", () => {
  const browser = storage();
  createNoteRecoveryStore("owner", () => browser).add(recovery());

  expect(
    createNoteRecoveryStore("another-owner", () => browser).getSnapshot().drafts
  ).toEqual([]);
});

test("discarding one recovery leaves the other draft available", () => {
  const browser = storage();
  const store = createNoteRecoveryStore("owner", () => browser);
  store.add(recovery());
  store.add(recovery("custom:another-note"));
  store.remove("custom:deleted-note");

  expect(
    createNoteRecoveryStore("owner", () => browser).getSnapshot().drafts
  ).toEqual([recovery("custom:another-note")]);
});

test("denied recovery writes retain the draft in memory and warn about reload", () => {
  const store = createNoteRecoveryStore("owner", () => ({
    getItem: () => null,
    setItem: () => {
      throw new Error("Storage full");
    },
  }));

  store.add(recovery());

  expect(store.getSnapshot().drafts).toEqual([recovery()]);
  expect(store.getSnapshot().warning).toContain("sebelum memuat ulang");
});

test("corrupt recovery storage surfaces a warning", () => {
  const browser = storage([
    ["sydia:notes:recovery:owner", JSON.stringify([{ draft: "invalid" }])],
  ]);

  const store = createNoteRecoveryStore("owner", () => browser);

  expect(store.getSnapshot().warning).toContain("tidak dapat dimuat");
});
