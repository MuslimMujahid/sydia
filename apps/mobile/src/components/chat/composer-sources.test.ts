import { expect, test } from "bun:test";
import { composerSourceSegments } from "./composer-sources";

test("sending a message with a saved source preserves the source kind and ID", () => {
  const source = {
    kind: "note",
    id: "custom:rehearsal",
    label: "Rehearsal",
  } as const;
  expect(composerSourceSegments("Summarize this", [source])).toEqual([
    { type: "text", text: "Summarize this" },
    { type: "text", text: " " },
    { type: "source", source },
  ]);
});

test("sending without sources uses the plain message contract", () => {
  expect(composerSourceSegments("Summarize this", [])).toBeUndefined();
});
