import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  consumeUIMessageStream,
  requireTerminalTurn,
  type SendMessageResult,
} from "./conversations.api";

function turn(status: "running" | "completed" | "failed"): SendMessageResult {
  const timestamp = "2026-09-09T00:00:00.000Z";

  return {
    conversation: {
      id: "conversation-1",
      title: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    userMessage: {
      id: "message-1",
      conversationId: "conversation-1",
      role: "user",
      content: "Ringkas dokumennya",
      createdAt: timestamp,
      attachments: [],
    },
    assistantMessage: null,
    assistantRun: {
      id: "run-1",
      conversationId: "conversation-1",
      assistantMessageId: null,
      status,
      errorMessage: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    toolInvocations: [],
  };
}

function eventStream(event: unknown): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
      );
      controller.close();
    },
  });
}

describe("consumeUIMessageStream", () => {
  it("accepts nested read-document state in a terminal turn", async () => {
    const completed = turn("completed");
    completed.toolInvocations = [
      {
        id: "tool-1",
        assistantRunId: "run-1",
        name: "read_document",
        label: "Membaca dokumen",
        status: "completed",
        objectId: null,
        objectType: null,
        state: {
          documentId: "document-1",
          chunks: [{ chunk: 0, page: 1, content: "Isi dokumen" }],
          hasMore: false,
        },
        output: {
          documentId: "document-1",
          chunks: [{ chunk: 0, page: 1, content: "Isi dokumen" }],
          hasMore: false,
        },
        createdAt: completed.assistantRun.createdAt,
        updatedAt: completed.assistantRun.updatedAt,
      },
    ];
    const received: SendMessageResult[] = [];

    await consumeUIMessageStream(
      eventStream({ type: "data-turn", data: completed }),
      {
        onActivity: () => undefined,
        onTextDelta: () => undefined,
        onTurn: (result) => received.push(result),
      }
    );

    assert.equal(received.length, 1);
    assert.equal(received[0]?.assistantRun.status, "completed");
  });
});

describe("requireTerminalTurn", () => {
  it("returns a terminal completed turn", () => {
    const result = turn("completed");

    assert.equal(requireTerminalTurn(result), result);
  });

  it("rejects stream closure with only a nonterminal turn", () => {
    assert.throws(
      () => requireTerminalTurn(turn("running")),
      /Respons Sydia tidak lengkap\./
    );
  });

  it("rejects stream closure without a turn", () => {
    assert.throws(
      () => requireTerminalTurn(undefined),
      /Respons Sydia tidak lengkap\./
    );
  });
});
