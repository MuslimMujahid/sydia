import { test, expect } from "@playwright/test";
import {
  isNoteRef,
  readLastNote,
  storeLastNote,
} from "../src/components/notes/navigation-state";

function storage(entries: Array<[string, string]> = []) {
  const values = new Map(entries);

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

test("missing navigation is an ordinary first visit", () => {
  expect(readLastNote(storage(), "owner")).toEqual({ kind: "empty" });
});

test("a custom note is remembered only for its account", () => {
  const browser = storage();
  expect(storeLastNote(browser, "owner", "custom:note-one")).toBeNull();
  expect(readLastNote(browser, "owner")).toEqual({
    kind: "stored",
    ref: "custom:note-one",
  });
  expect(readLastNote(browser, "another-owner")).toEqual({ kind: "empty" });
});

test("a stored daily note retains its exact calendar day", () => {
  const browser = storage();
  storeLastNote(browser, "owner", "daily:2026-10-17");
  expect(readLastNote(browser, "owner")).toEqual({
    kind: "stored",
    ref: "daily:2026-10-17",
  });
});

test("malformed saved state surfaces a navigation recovery warning", () => {
  const browser = storage([["sydia:notes:last:owner", "{invalid json"]]);
  expect(readLastNote(browser, "owner")).toEqual({
    kind: "unavailable",
    message:
      "Navigasi sebelumnya tidak dapat dipulihkan. Catatan hari ini dibuka.",
  });
});

test("an impossible date cannot become the remembered destination", () => {
  expect(isNoteRef("daily:2026-02-30")).toBe(false);
});

test("storage reads denied by the browser return an explicit degraded state", () => {
  const browser = {
    getItem: () => {
      throw new Error("Storage denied");
    },
    setItem: () => undefined,
  };

  expect(readLastNote(browser, "owner").kind).toBe("unavailable");
});

test("storage write failure warns that navigation survives only in memory", () => {
  const browser = {
    getItem: () => null,
    setItem: () => {
      throw new Error("Storage full");
    },
  };

  expect(storeLastNote(browser, "owner", "custom:note-one")).toBe(
    "Navigasi terakhir hanya diingat selama halaman ini terbuka."
  );
});
