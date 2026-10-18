import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToolInvocation } from "@/lib/services/api/conversations/conversations.api";
import { collectChatEntities } from "./chat-entities";
import { enrichEntityMentions } from "./entity-mentions";
import type { Root } from "hast";

function tool(
  name: string,
  output: ToolInvocation["output"],
  status: ToolInvocation["status"] = "completed"
): ToolInvocation {
  return {
    id: "call",
    assistantRunId: "run",
    name,
    label: name,
    status,
    output,
    objectId: null,
    objectType: null,
    state: null,
    createdAt: "2026-10-18T08:00:00Z",
    updatedAt: "2026-10-18T08:00:00Z",
  };
}

describe("confirmed note references", () => {
  it("turns the previously plain custom-note title into a confirmed mention", () => {
    const { entities } = collectChatEntities([
      tool("search_notes", {
        notes: [
          { ref: "custom:design", title: "Keputusan desain", kind: "note" },
        ],
      }),
    ]);

    const tree: Root = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "strong",
          properties: {},
          children: [{ type: "text", value: "Keputusan desain" }],
        },
      ],
    };

    assert.deepEqual(
      [...enrichEntityMentions(tree, entities)],
      ["note:custom:design"]
    );
  });

  it("uses identity to distinguish notes with identical titles", () => {
    const { entities } = collectChatEntities([
      tool("search_notes", {
        notes: [
          { ref: "custom:a", title: "Design" },
          { ref: "custom:b", title: "Design" },
        ],
      }),
    ]);

    const tree: Root = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "a",
          properties: { href: "#note/custom%3Ab" },
          children: [{ type: "text", value: "Design" }],
        },
      ],
    };

    assert.deepEqual(
      [...enrichEntityMentions(tree, entities)],
      ["note:custom:b"]
    );
  });

  it("normalizes dated search results without database IDs", () => {
    const { entities } = collectChatEntities([
      tool("search_daily_notes", {
        notes: [{ date: "2026-10-18", passage: "Meeting" }],
      }),
    ]);

    assert.equal(entities[0]?.id, "daily:2026-10-18");
  });

  it("normalizes a daily write as a mutation", () => {
    const { entities } = collectChatEntities([
      tool("write_daily_note", {
        date: "2026-10-18",
        noteId: "row",
        written: "Meeting",
      }),
    ]);

    assert.equal(entities[0]?.mutation, true);
    assert.equal(entities[0]?.id, "daily:2026-10-18");
  });

  it("does not expose folders, trash, absent days, or failed tools", () => {
    const { entities } = collectChatEntities([
      tool(
        "create_custom_note",
        { id: "a", title: "Design", kind: "note" },
        "failed"
      ),
      tool("manage_notes_item", {
        id: "folder",
        title: "Folder",
        kind: "folder",
      }),
      tool("manage_notes_item", {
        id: "a",
        title: "Design",
        kind: "note",
        trashedAt: "2026-10-18T08:00:00Z",
      }),
      tool("read_daily_note", { date: "2026-10-18", found: false }),
    ]);

    assert.deepEqual(entities, []);
  });

  it("rejects malformed daily dates rather than creating a guessed reference", () => {
    const result = collectChatEntities([
      tool("read_daily_note", { date: "2026-02-31", found: true }),
    ]);

    assert.deepEqual(result.entities, []);
    assert.equal(result.diagnostics.length, 1);
  });
});
