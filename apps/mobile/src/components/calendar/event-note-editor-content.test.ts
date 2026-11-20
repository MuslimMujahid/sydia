import { expect, test } from "bun:test";
import {
  editableEventNotes,
  isEventNoteLink,
} from "./event-note-editor-content";

test("opens existing Google notes with supported marks, lists, and links intact", () => {
  const html =
    '<p><strong>Penting</strong><br><em>Bawa berkas</em> ke <a href="https://example.com/p">sini</a></p><ol start="3"><li><p>Daftar hadir</p></li></ol>';

  expect(editableEventNotes(html)).toEqual({ kind: "editable", html });
});

test("escapes legacy plain text before opening it in the rich editor", () => {
  expect(editableEventNotes("Biaya < 100 & waktu > 1 jam")).toEqual({
    kind: "editable",
    html: "<p>Biaya &lt; 100 &amp; waktu &gt; 1 jam</p>",
  });
});

test("preserves an unsupported layout without offering a lossy edit", () => {
  expect(
    editableEventNotes("<table><tr><td>Peserta</td></tr></table>")
  ).toEqual({ kind: "unsupported" });
});

test("keeps existing event descriptions with inline styles read-only", () => {
  expect(editableEventNotes('<p style="color:red">Penting</p>')).toEqual({
    kind: "unsupported",
  });
});

test("rejects markup that could load embedded resources before it reaches the editor", () => {
  expect(
    editableEventNotes('<p>Foto</p><img src="https://example.com/image.jpg">')
  ).toEqual({ kind: "unsupported" });
});

test("blocks a stored link when its protocol cannot be edited safely", () => {
  expect(
    editableEventNotes('<p><a href="javascript:alert(1)">Tautan</a></p>')
  ).toEqual({ kind: "unsupported" });
});

test("accepts HTTPS URLs as event note links", () => {
  expect(isEventNoteLink("https://example.com/path?q=1&other=2")).toBe(true);
});
