import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToolInvocation } from "@/lib/services/api/conversations/conversations.api";
import {
  collectChatEntities,
  matchEntityText,
  type ChatEntity,
} from "./chat-entities";

const timestamp = "2026-10-08T08:00:00.000Z";

function tool(
  name: string,
  output: ToolInvocation["output"],
  overrides: Partial<ToolInvocation> = {}
): ToolInvocation {
  return {
    id: "invocation-1",
    assistantRunId: "run-1",
    name,
    label: name,
    status: "completed",
    objectId: null,
    objectType: null,
    state: null,
    output,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function task(id = "task-1", title = "Baca buku"): ChatEntity {
  return {
    kind: "task",
    id,
    title,
    status: "inbox",
    mutation: false,
    observedAt: timestamp,
  };
}

describe("collectChatEntities", () => {
  it("recognizes the nested task record without relying on convenience metadata", () => {
    const result = collectChatEntities([
      tool("create_task", {
        objectType: "task",
        object: { id: "task-1", title: "Baca buku", status: "inbox" },
      }),
    ]);

    assert.deepEqual(result.entities, [{ ...task(), mutation: true }]);
  });
  it("recognizes every reminder in a multi-schedule creation", () => {
    const result = collectChatEntities([
      tool("create_reminder", {
        reminders: [
          { id: "r-1", title: "Minum obat" },
          { id: "r-2", title: "Minum obat" },
        ],
      }),
    ]);

    assert.deepEqual(
      result.entities.map((entity) => entity.id),
      ["r-1", "r-2"]
    );
  });
  it("recognizes reminder lookup records with local date and time", () => {
    const result = collectChatEntities([
      tool("list_reminders", {
        reminders: [
          {
            id: "r-1",
            title: "Minum obat",
            date: "2026-10-08",
            time: "17:00",
          },
        ],
      }),
    ]);

    assert.deepEqual(
      result.entities.map((entity) => [
        entity.kind,
        entity.title,
        entity.mutation,
      ]),
      [["reminder", "Minum obat", false]]
    );
  });
  it("recognizes document search references using document IDs", () => {
    const result = collectChatEntities([
      tool("search_documents", {
        sources: [
          {
            documentId: "doc-1",
            filename: "Invoice.pdf",
            page: 1,
            quote: "Private document content",
          },
        ],
      }),
    ]);

    assert.deepEqual(result.entities, [
      {
        kind: "file",
        id: "doc-1",
        title: "Invoice.pdf",
        mutation: false,
        observedAt: timestamp,
      },
    ]);
  });
  it("recognizes saved attachment summaries", () => {
    const result = collectChatEntities([
      tool("save_attached_files", {
        objectType: "documents",
        objects: [
          {
            id: "doc-1",
            filename: "Invoice.pdf",
            size: 123,
            mimeType: "application/pdf",
            status: "ready",
          },
        ],
      }),
    ]);

    assert.deepEqual(
      result.entities.map((entity) => [entity.kind, entity.id, entity.title]),
      [["file", "doc-1", "Invoice.pdf"]]
    );
  });
  it("recognizes a sent file and its verified URL", () => {
    const result = collectChatEntities([
      tool("send_file", {
        objectType: "file",
        object: {
          documentId: "doc-1",
          filename: "Invoice.pdf",
          url: "https://example.test/documents/doc-1/content",
        },
      }),
    ]);

    assert.equal(
      result.entities[0]?.kind === "file" && result.entities[0].url,
      "https://example.test/documents/doc-1/content"
    );
  });
  it("recognizes events despite a null convenience objectType", () => {
    const result = collectChatEntities([
      tool("create_calendar_event", {
        objectType: "calendar_event",
        object: {
          id: "event-1",
          title: "Rapat tim",
          startAt: timestamp,
          endAt: "2026-10-08T09:00:00.000Z",
          timezone: "Asia/Makassar",
        },
      }),
    ]);

    assert.equal(result.entities[0]?.kind, "event");
  });
  it("deduplicates document references from several search chunks", () => {
    const result = collectChatEntities([
      tool("search_documents", {
        sources: [
          { documentId: "doc-1", filename: "Invoice.pdf", page: 1 },
          { documentId: "doc-1", filename: "Invoice.pdf", page: 2 },
        ],
      }),
    ]);

    assert.equal(result.entities.length, 1);
  });
  it("preserves a successful mutation when a later lookup repeats the entity", () => {
    const result = collectChatEntities([
      tool("create_task", { object: { id: "task-1", title: "Baca buku" } }),
      tool("list_tasks", {
        tasks: [{ id: "task-1", title: "Baca buku", status: "done" }],
      }),
    ]);

    assert.deepEqual(result.entities, [
      { ...task(), status: "done", mutation: true },
    ]);
  });
  it("does not recognize unconfirmed records", () => {
    assert.deepEqual(
      collectChatEntities([
        tool(
          "create_task",
          { object: { id: "task-1", title: "Baca buku" } },
          { status: "failed" }
        ),
      ]),
      { entities: [], diagnostics: [] }
    );
  });
  it("returns a typed diagnostic for a supported record without an ID", () => {
    const result = collectChatEntities([
      tool("create_task", { object: { title: "Baca buku" } }),
    ]);

    assert.equal(result.entities.length, 0);
    assert.equal(result.diagnostics[0]?.invocationId, "invocation-1");
    assert.match(result.diagnostics[0]!.reason, /id:/);
  });
  it("does not mistake memory or contact output for supported entities", () => {
    assert.deepEqual(
      collectChatEntities([
        tool("save_memory", { object: { id: "memory-1", title: "Baca buku" } }),
      ]),
      { entities: [], diagnostics: [] }
    );
  });
});

describe("matchEntityText", () => {
  it("recognizes repeated names with punctuation while preserving the original text", () => {
    assert.deepEqual(
      matchEntityText("Tugas “Baca buku” dibuat. Baca buku besok.", [
        task(),
      ]).map((part) => [part.text, part.entity?.id]),
      [
        ["Tugas “", undefined],
        ["Baca buku", "task-1"],
        ["” dibuat. ", undefined],
        ["Baca buku", "task-1"],
        [" besok.", undefined],
      ]
    );
  });
  it("matches names without regard to case", () => {
    assert.equal(
      matchEntityText("BACA BUKU", [task()])[0]?.entity?.id,
      "task-1"
    );
  });
  it("does not match a short name inside an unrelated word", () => {
    assert.deepEqual(matchEntityText("Baca bukunya", [task()]), [
      { text: "Baca bukunya" },
    ]);
  });
  it("prefers the longest entity name", () => {
    assert.equal(
      matchEntityText("Baca buku sejarah", [
        task(),
        task("task-2", "Baca buku sejarah"),
      ])[0]?.entity?.id,
      "task-2"
    );
  });
  it("leaves duplicate names as text rather than choosing an entity", () => {
    assert.deepEqual(matchEntityText("Baca buku", [task(), task("task-2")]), [
      { text: "Baca buku" },
    ]);
  });
  it("does not select a shorter name within an ambiguous longer name", () => {
    assert.deepEqual(
      matchEntityText("Baca buku sejarah", [
        task(),
        task("task-2", "Baca buku sejarah"),
        task("task-3", "Baca buku sejarah"),
      ]),
      [{ text: "Baca buku sejarah" }]
    );
  });
  it("treats regular expression characters in filenames literally", () => {
    const file: ChatEntity = {
      kind: "file",
      id: "doc-1",
      title: "Invoice (1)+.pdf",
      mutation: false,
      observedAt: timestamp,
    };

    assert.equal(
      matchEntityText("Buka Invoice (1)+.pdf.", [file])[1]?.entity?.id,
      "doc-1"
    );
  });
});
