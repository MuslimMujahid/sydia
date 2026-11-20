import { expect, test } from "bun:test";
import { readMoveSelection } from "./move-selection";

test("a move selection retains file and folder revisions for the server's conflict check", () => {
  const encoded =
    '[{"kind":"file","id":"report","revision":5},{"kind":"folder","id":"work","revision":8}]';

  expect(readMoveSelection(encoded)).toEqual({
    ok: true,
    items: [
      { kind: "file", id: "report", revision: 5 },
      { kind: "folder", id: "work", revision: 8 },
    ],
  });
});

test("a move route with no selection cannot submit a move", () => {
  expect(readMoveSelection(undefined)).toEqual({ ok: false });
});

test("a move route rejects a revision that is not a positive integer", () => {
  const encoded = '[{"kind":"file","id":"report","revision":"2"}]';

  expect(readMoveSelection(encoded)).toEqual({ ok: false });
});

test("a move route gives a typed failure for malformed selection data", () => {
  expect(readMoveSelection("{")).toEqual({ ok: false });
});
