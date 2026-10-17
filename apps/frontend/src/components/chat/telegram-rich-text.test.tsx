import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NativeChatText } from "./native-chat-text";

describe("Telegram rich message preview", () => {
  it("preserves blank lines between the weekly title, introduction, and first section", () => {
    const html = renderToStaticMarkup(
      <NativeChatText
        channel="telegram"
        content={[
          "**Briefing mingguan · 17 Okt 2026–23 Okt 2026**",
          "Semangat pagi!",
          "**Hari ini**",
        ].join("\\\n\\\n")}
      />
    );

    assert.match(
      html,
      /<strong>Briefing mingguan · 17 Okt 2026–23 Okt 2026<\/strong><br\/>\n<br\/>\nSemangat pagi!<br\/>\n<br\/>\n<strong>Hari ini<\/strong>/
    );
  });

  it("renders a divider between today's brief and the coming six days", () => {
    const html = renderToStaticMarkup(
      <NativeChatText
        channel="telegram"
        content={
          "**Hari ini**\n\n- Bayar tagihan\n\n---\n\n**Enam hari ke depan**\n\n- Rapat"
        }
      />
    );

    assert.match(
      html,
      /<strong>Hari ini<\/strong>[\s\S]*<hr\/>[\s\S]*<strong>Enam hari ke depan<\/strong>/
    );
  });

  it("renders emphasis and native nested lists", () => {
    const html = renderToStaticMarkup(
      <NativeChatText
        channel="telegram"
        content={
          "**Ready**\n\n- First\n  - Nested\n- Second\n\n1. Start\n2. Finish"
        }
      />
    );

    assert.ok(html.includes("<strong>Ready</strong>"));
    assert.ok(html.includes("<li>First\n<ul>\n<li>Nested</li>"));
    assert.ok(html.includes("<ol>\n<li>Start</li>\n<li>Finish</li>"));
  });

  it("renders headings, tables, quotes, and code", () => {
    const html = renderToStaticMarkup(
      <NativeChatText
        channel="telegram"
        content={
          "## Plan\n\n| Task | Status |\n| --- | --- |\n| Read | Ready |\n\n> Quote\n\n`task_id`\n\n```text\nline one\nline two\n```"
        }
      />
    );

    assert.ok(html.includes("<h2>Plan</h2>"));
    assert.ok(html.includes('<th scope="col"'));
    assert.ok(html.includes(">Ready</td>"));
    assert.ok(html.includes("<blockquote>\n<p>Quote</p>"));
    assert.ok(html.includes("<code>task_id</code>"));
    assert.ok(
      html.includes('class="language-text">line one\nline two\n</code>')
    );
  });

  it("preserves escaped literal titles", () => {
    const html = renderToStaticMarkup(
      <NativeChatText
        channel="telegram"
        content={"- **Read \\*draft\\* \\<b\\> \\$5 \\=\\=ready\\=\\=**"}
      />
    );

    assert.ok(
      html.includes("<strong>Read *draft* &lt;b&gt; $5 ==ready==</strong>")
    );
  });

  it("renders safe links and never executes raw HTML or JavaScript URLs", () => {
    const html = renderToStaticMarkup(
      <NativeChatText
        channel="telegram"
        content={
          "[Docs](https://example.com) [unsafe](javascript:alert)\n\n<script>alert(1)</script>"
        }
      />
    );

    assert.ok(html.includes('href="https://example.com"'));
    assert.ok(html.includes('rel="noreferrer noopener"'));
    assert.ok(!html.includes("javascript:"));
    assert.ok(!html.includes("<script>"));
  });

  it("retains WhatsApp marker syntax independently of Telegram", () => {
    const html = renderToStaticMarkup(
      <NativeChatText
        channel="whatsapp"
        content={"*Ready*\n- First\n- Second"}
      />
    );

    assert.ok(html.includes("<strong>Ready</strong>"));
    assert.ok(html.includes("<li>First</li><li>Second</li>"));
  });
});
