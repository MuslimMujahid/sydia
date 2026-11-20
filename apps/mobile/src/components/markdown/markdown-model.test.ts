import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import type { ChatEntity } from "@/components/chat/chat-entities";
import {
  decodeEntities,
  markdownToPlainText,
  parseAssistantMarkdown,
  type BlockNode,
  type InlineNode,
} from "./markdown-model";

const observedAt = "2026-10-08T08:00:00.000Z";

const task: ChatEntity = {
  kind: "task",
  id: "task-1",
  title: "Baca buku",
  mutation: true,
  observedAt,
};

const event: ChatEntity = {
  kind: "event",
  id: "shared/id",
  title: "Review Aurora",
  startAt: "2026-10-29T02:00:00Z",
  endAt: "2026-10-29T03:00:00Z",
  timezone: "Asia/Makassar",
  mutation: true,
  observedAt,
};

const reminder: ChatEntity = {
  kind: "reminder",
  id: "shared/id",
  title: "Review Aurora",
  scheduledAt: "2026-10-29T00:00:00Z",
  mutation: true,
  observedAt,
};

function inlineOf(block: BlockNode | undefined): InlineNode[] {
  assert.ok(block && "children" in block && block.type !== "blockquote");

  return block.children as InlineNode[];
}

function entityKeys(nodes: InlineNode[]): string[] {
  return nodes.flatMap((node) =>
    node.type === "entity" ? [`${node.entity.kind}:${node.entity.id}`] : []
  );
}

describe("parseAssistantMarkdown entity mentions", () => {
  it("renders same-title event and reminder links inline without appending duplicates", () => {
    const document = parseAssistantMarkdown(
      "[Review Aurora](#event/shared%2Fid) [Review Aurora](#reminder/shared%2Fid)",
      [event, reminder]
    );

    assert.equal(document.blocks.length, 1);
    assert.deepEqual(entityKeys(inlineOf(document.blocks[0])), [
      "event:shared/id",
      "reminder:shared/id",
    ]);
  });

  it("appends only the omitted reminder when the event is already referenced", () => {
    const document = parseAssistantMarkdown(
      "[Review Aurora](#event/shared%2Fid)",
      [event, reminder]
    );

    assert.equal(document.blocks.length, 2);
    assert.deepEqual(entityKeys(inlineOf(document.blocks[1])), [
      "reminder:shared/id",
    ]);
  });

  it("uses explicit kind labels to resolve older same-title mentions", () => {
    const document = parseAssistantMarkdown("**Pengingat: Review Aurora**", [
      { ...event, mutation: false },
      { ...reminder, mutation: false },
    ]);

    assert.deepEqual([...document.mentioned], ["reminder:shared/id"]);
  });

  it("leaves older ambiguous mentions unresolved", () => {
    const document = parseAssistantMarkdown("**Review Aurora**", [
      { ...event, mutation: false },
      { ...reminder, mutation: false },
    ]);

    assert.equal(document.mentioned.size, 0);
    assert.deepEqual(inlineOf(document.blocks[0]), [
      { type: "text", text: "Review Aurora", marks: ["strong"] },
    ]);
  });

  it("does not treat a reminder ID as a confirmed event ID", () => {
    const document = parseAssistantMarkdown(
      "[Review Aurora](#event/shared%2Fid)",
      [reminder],
      false
    );

    assert.deepEqual(inlineOf(document.blocks[0]), [
      { type: "text", text: "Review Aurora", marks: [] },
    ]);
  });

  it("uses the confirmed title rather than a misleading link label", () => {
    const document = parseAssistantMarkdown("[Other task](#task/task-1)", [
      task,
    ]);
    const [node] = inlineOf(document.blocks[0]);

    assert.equal(node?.type, "entity");
    assert.equal(node?.type === "entity" ? node.label : null, "Baca buku");
  });

  it("recognizes a title split across emphasis", () => {
    const document = parseAssistantMarkdown("Tugas Baca **buku** dibuat.", [
      task,
    ]);

    assert.deepEqual(inlineOf(document.blocks[0]), [
      { type: "text", text: "Tugas ", marks: [] },
      { type: "entity", entity: task, label: "Baca buku", marks: [] },
      { type: "text", text: " dibuat.", marks: [] },
    ]);
  });

  it("keeps emphasis around a name that sits wholly inside it", () => {
    const document = parseAssistantMarkdown("**Baca buku**", [task]);

    assert.deepEqual(inlineOf(document.blocks[0]), [
      { type: "entity", entity: task, label: "Baca buku", marks: ["strong"] },
    ]);
  });

  it("keeps inline code and unrelated links unchanged", () => {
    const document = parseAssistantMarkdown(
      "`Baca buku` [Baca buku](https://example.test)",
      [{ ...task, mutation: false }]
    );

    assert.equal(document.mentioned.size, 0);
    assert.deepEqual(inlineOf(document.blocks[0]), [
      { type: "code", text: "Baca buku" },
      { type: "text", text: " ", marks: [] },
      {
        type: "link",
        href: "https://example.test",
        children: [{ type: "text", text: "Baca buku", marks: [] }],
      },
    ]);
  });

  it("replaces a verified sent-file link with the file pill", () => {
    const file: ChatEntity = {
      kind: "file",
      id: "doc-1",
      title: "Invoice.pdf",
      url: "https://example.test/file",
      mutation: true,
      observedAt,
    };
    const document = parseAssistantMarkdown(
      "[Download](https://example.test/file)",
      [file]
    );

    assert.deepEqual(entityKeys(inlineOf(document.blocks[0])), ["file:doc-1"]);
    assert.equal(document.blocks.length, 1);
  });

  it("appends a mutated record the reply does not name", () => {
    const document = parseAssistantMarkdown("Tugas dibuat.", [task]);

    assert.equal(document.blocks.length, 2);
    assert.deepEqual(entityKeys(inlineOf(document.blocks[1])), ["task:task-1"]);
  });

  it("does not append lookups, mentioned records, or anything while streaming", () => {
    assert.equal(
      parseAssistantMarkdown("Baca buku dibuat.", [task]).blocks.length,
      1
    );
    assert.equal(
      parseAssistantMarkdown("Tidak ada.", [{ ...task, mutation: false }])
        .blocks.length,
      1
    );
    assert.equal(
      parseAssistantMarkdown("Tugas", [task], false).blocks.length,
      1
    );
  });
});

describe("parseAssistantMarkdown blocks", () => {
  it("parses lists, task items, tables, code, and skips raw HTML", () => {
    const document = parseAssistantMarkdown(
      [
        "## Rencana",
        "- [x] Beli susu",
        "- Jemput anak",
        "",
        "| Hari | Jam |",
        "|:--|--:|",
        "| Senin | 07.00 |",
        "",
        "```",
        "kode",
        "```",
        "<div>html</div>",
      ].join("\n")
    );

    assert.deepEqual(
      document.blocks.map((block) => block.type),
      ["heading", "list", "table", "code"]
    );
    const list = document.blocks[1];
    assert.ok(list?.type === "list");
    assert.equal(list.items[0]?.task, true);
    assert.equal(list.items[0]?.checked, true);
    const table = document.blocks[2];
    assert.ok(table?.type === "table");
    assert.deepEqual(table.align, ["left", "right"]);
  });

  it("decodes HTML entities in text", () => {
    assert.equal(
      decodeEntities("Tom &amp; Jerry &#39;99 &#x41;"),
      "Tom & Jerry '99 A"
    );
  });

  it("produces readable plain text for copying", () => {
    assert.equal(
      markdownToPlainText("**Belanja**\n\n1. Susu\n2. Roti"),
      "Belanja\n\n1. Susu\n2. Roti"
    );
  });
});
