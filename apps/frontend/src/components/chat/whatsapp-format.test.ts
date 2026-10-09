import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseWhatsAppInline, parseWhatsAppText } from "./whatsapp-format";

describe("WhatsApp text formatting", () => {
  it("uses one asterisk for bold", () => {
    assert.deepEqual(parseWhatsAppInline("*Hello*"), [
      { kind: "bold", children: [{ kind: "text", text: "Hello" }] },
    ]);
  });
  it("keeps underscores inside identifiers literal", () => {
    assert.deepEqual(parseWhatsAppInline("my_task_id"), [
      { kind: "text", text: "my_task_id" },
    ]);
  });
  it("keeps styling syntax inside code literal", () => {
    assert.deepEqual(parseWhatsAppInline("`*Hello*`"), [
      { kind: "code", text: "*Hello*" },
    ]);
  });
  it("preserves unclosed delimiters", () => {
    assert.deepEqual(parseWhatsAppInline("*unfinished"), [
      { kind: "text", text: "*unfinished" },
    ]);
  });
  it("preserves Unicode around emphasis", () => {
    assert.deepEqual(parseWhatsAppInline("🙂 _Halo_"), [
      { kind: "text", text: "🙂 " },
      { kind: "italic", children: [{ kind: "text", text: "Halo" }] },
    ]);
  });
  it("recognizes bullet lines", () => {
    assert.deepEqual(
      parseWhatsAppText("- First\n* Second").map((block) => block.kind),
      ["bullet", "bullet"]
    );
  });
  it("preserves the starting number of a numbered list", () => {
    assert.deepEqual(parseWhatsAppText("3. Third"), [
      { kind: "number", number: 3, content: [{ kind: "text", text: "Third" }] },
    ]);
  });
  it("recognizes quote syntax at the start of a line", () => {
    assert.deepEqual(parseWhatsAppText("> Quoted"), [
      { kind: "quote", content: [{ kind: "text", text: "Quoted" }] },
    ]);
  });
  it("keeps multiline monospace opaque even after introductory text", () => {
    assert.deepEqual(parseWhatsAppText("Code: ```first\n- literal```"), [
      {
        kind: "paragraph",
        content: [
          { kind: "text", text: "Code: " },
          { kind: "code", text: "first\n- literal" },
        ],
      },
    ]);
  });
  it("does not interpret HTML, headings, or Markdown links", () => {
    assert.deepEqual(
      parseWhatsAppInline("# Heading <b>text</b> [label](url)"),
      [{ kind: "text", text: "# Heading <b>text</b> [label](url)" }]
    );
  });
  it("preserves blank lines", () => {
    assert.equal(parseWhatsAppText("First\n\nLast").length, 3);
  });
});
