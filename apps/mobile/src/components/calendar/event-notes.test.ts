import { describe, expect, test } from "bun:test";
import {
  hasRichFormatting,
  isHtmlNotes,
  notesSummary,
  notesToPlainText,
  plainTextToNotesHtml,
} from "./event-notes";

describe("notesToPlainText", () => {
  test("keeps legacy plain text literal, angle brackets included", () => {
    expect(notesToPlainText("Bawa map <biru>\nJangan telat")).toBe(
      "Bawa map <biru>\nJangan telat"
    );
  });

  test("turns web editor HTML into lines", () => {
    expect(
      notesToPlainText(
        "<p>Bawa <strong>rapor</strong></p><p></p><p>Ruang &amp; aula</p>"
      )
    ).toBe("Bawa rapor\n\nRuang & aula");
  });

  test("keeps link targets and list items readable", () => {
    expect(
      notesToPlainText(
        '<ul><li>Tiket</li><li><a href="https://meet.example/x">Rapat</a></li></ul>'
      )
    ).toBe("• Tiket\n• Rapat (https://meet.example/x)");
  });

  test("decodes numeric entities from Google descriptions", () => {
    expect(notesToPlainText("<p>Caf&#233; &#x2014; jam 7</p>")).toBe(
      "Café — jam 7"
    );
  });
});

describe("plainTextToNotesHtml", () => {
  test("writes one escaped paragraph per line", () => {
    expect(plainTextToNotesHtml("Bawa <map>\n\nRuang 2")).toBe(
      "<p>Bawa &lt;map&gt;</p><p></p><p>Ruang 2</p>"
    );
  });

  test("clears empty notes", () => {
    expect(plainTextToNotesHtml("  \n ")).toBe("");
  });

  test("round-trips through the plain-text view", () => {
    const html = plainTextToNotesHtml("Satu\nDua & tiga");

    expect(isHtmlNotes(html)).toBe(true);
    expect(notesToPlainText(html)).toBe("Satu\nDua & tiga");
  });
});

test("flags formatting that plain-text editing would simplify", () => {
  expect(hasRichFormatting("<p>Biasa</p>")).toBe(false);
  expect(hasRichFormatting("<p><b>Tebal</b></p>")).toBe(true);
});

test("summarizes notes on one line", () => {
  expect(notesSummary("<p>Satu</p><p>Dua</p>")).toBe("Satu Dua");
});
