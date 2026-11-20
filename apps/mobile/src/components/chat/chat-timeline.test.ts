import assert from "node:assert/strict";
import { describe, it } from "bun:test";
import type {
  AssistantRun,
  ConversationMessage,
  ToolInvocation,
} from "@/lib/services/api/conversations/conversations.api";
import {
  buildTimeline,
  currentActivity,
  documentSources,
} from "./chat-timeline";

function message(
  id: string,
  createdAt: string,
  role: "user" | "assistant" = "user"
): ConversationMessage {
  return {
    id,
    conversationId: "c1",
    role,
    content: id,
    createdAt,
    attachments: [],
  };
}

function run(
  id: string,
  createdAt: string,
  overrides: Partial<AssistantRun> = {}
): AssistantRun {
  return {
    id,
    conversationId: "c1",
    assistantMessageId: null,
    status: "running",
    errorMessage: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function tool(
  name: string,
  output: ToolInvocation["output"],
  status: ToolInvocation["status"] = "completed"
): ToolInvocation {
  return {
    id: `${name}-1`,
    assistantRunId: "r1",
    name,
    label: `label ${name}`,
    status,
    objectId: null,
    objectType: null,
    state: null,
    output,
    createdAt: "2026-11-19T01:00:00Z",
    updatedAt: "2026-11-19T01:00:00Z",
  };
}

describe("buildTimeline", () => {
  const now = new Date("2026-11-19T05:00:00Z");

  it("opens each local day with a label and keeps runs without messages", () => {
    const { entries, lastDayKey } = buildTimeline(
      [
        message("m1", "2026-11-18T10:00:00Z"),
        message("m2", "2026-11-19T01:00:00Z"),
        message("a2", "2026-11-19T01:00:05Z", "assistant"),
      ],
      [
        run("r-done", "2026-11-19T01:00:01Z", {
          assistantMessageId: "a2",
          status: "completed",
        }),
        run("r-failed", "2026-11-19T02:00:00Z", { status: "failed" }),
      ],
      "Asia/Jakarta",
      "id",
      now
    );

    assert.deepEqual(
      entries.map((entry) => entry.key),
      ["day-2026-11-18", "m1", "day-2026-11-19", "m2", "a2", "run-r-failed"]
    );
    assert.equal(lastDayKey, "2026-11-19");
    assert.equal(entries[0]?.type === "day" ? entries[0].label : "", "Kemarin");
  });
});

describe("currentActivity", () => {
  it("names the running tool in the user's language", () => {
    assert.deepEqual(
      currentActivity(
        run("r1", "2026-11-19T01:00:00Z"),
        [tool("create_task", null, "running")],
        "id"
      ),
      { phase: "executing_tool", label: "Sydia sedang membuat tugas…" }
    );
  });

  it("reports a queued run as waiting", () => {
    assert.equal(
      currentActivity(
        run("r1", "2026-11-19T01:00:00Z", { status: "queued" }),
        [],
        "en"
      ).label,
      "Waiting for its turn…"
    );
  });
});

describe("documentSources", () => {
  it("groups search results by document with page hints and excerpts", () => {
    const sources = documentSources(
      [
        tool("search_documents", {
          sources: [
            {
              documentId: "d1",
              filename: "KK.pdf",
              page: 2,
              quote: "Nomor KK",
            },
            {
              documentId: "d1",
              filename: "KK.pdf",
              page: 2,
              quote: "Nomor KK",
            },
            {
              documentId: "d2",
              filename: "Rapor.pdf",
              chunk: 0,
              content: "Nilai",
            },
          ],
        }),
      ],
      "id"
    );

    assert.deepEqual(sources, [
      {
        documentId: "d1",
        documentName: "KK.pdf",
        locations: ["halaman 2"],
        excerpts: ["Nomor KK"],
      },
      {
        documentId: "d2",
        documentName: "Rapor.pdf",
        locations: ["bagian 1"],
        excerpts: ["Nilai"],
      },
    ]);
  });
});
