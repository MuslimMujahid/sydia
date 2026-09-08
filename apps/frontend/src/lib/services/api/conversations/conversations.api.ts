import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { api, toApiError } from "../api";
import type { ApiResponse } from "../api.types";

export type Conversation = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ConversationSummary = Conversation & {
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
};

export type ConversationRole = "user" | "assistant";

export type ConversationMessage = {
  id: string;
  conversationId: string;
  role: ConversationRole;
  content: string;
  createdAt: string;
};

export type AssistantRunStatus = "queued" | "running" | "completed" | "failed";

export type AssistantRun = {
  id: string;
  conversationId: string;
  assistantMessageId: string | null;
  status: AssistantRunStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ToolInvocationStatus =
  | "pending"
  | "running"
  | "awaiting_confirmation"
  | "completed"
  | "failed"
  | "rejected";

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type ToolInvocation = {
  id: string;
  assistantRunId: string;
  name: string;
  label: string;
  status: ToolInvocationStatus;
  objectId: string | null;
  objectType: "task" | "reminder" | "category" | "category_confirmation" | null;
  state: Record<string, string | number | boolean | null> | null;
  output: JsonValue;
  createdAt: string;
  updatedAt: string;
};

export type ConversationDetail = {
  conversation: Conversation;
  messages: ConversationMessage[];
  assistantRuns: AssistantRun[];
  toolInvocations: ToolInvocation[];
};

export type SendMessageVariables = {
  conversationId?: string;
  content: string;
  idempotencyKey: string;
  attachmentIds?: string[];
};
export type AssistantActivityPhase =
  "queued" | "preparing" | "executing_tool" | "awaiting_confirmation";

export type AssistantActivity = {
  phase: AssistantActivityPhase;
  label: string;
};

export type SendMessageResult = {
  conversation: Conversation;
  userMessage: ConversationMessage;
  assistantMessage: ConversationMessage | null;
  assistantRun: AssistantRun;
  toolInvocations: ToolInvocation[];
};

export type RetryAssistantRunVariables = {
  conversationId: string;
  runId: string;
};

export type RetryAssistantRunResult = {
  conversation: Conversation;
  assistantMessage: ConversationMessage | null;
  assistantRun: AssistantRun;
  toolInvocations: ToolInvocation[];
};

const getConversationsServer = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      const cookie = getRequestHeader("cookie");
      const response = await api.get<ApiResponse<ConversationSummary[]>>(
        "/conversations",
        { headers: cookie ? { cookie } : undefined }
      );

      return response.data.data;
    } catch (error) {
      throw toApiError(error, "Daftar percakapan tidak dapat dimuat.");
    }
  }
);

const getConversationServer = createServerFn({ method: "GET" })
  .validator(z.string().min(1))
  .handler(async ({ data: conversationId }) => {
    try {
      const cookie = getRequestHeader("cookie");
      const response = await api.get<ApiResponse<ConversationDetail>>(
        `/conversations/${encodeURIComponent(conversationId)}`,
        { headers: cookie ? { cookie } : undefined }
      );

      return response.data.data;
    } catch (error) {
      throw toApiError(error, "Percakapan ini tidak dapat dimuat.");
    }
  });

export async function getConversations(): Promise<ConversationSummary[]> {
  if (typeof window === "undefined") return getConversationsServer();

  try {
    const response =
      await api.get<ApiResponse<ConversationSummary[]>>("/conversations");

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Daftar percakapan tidak dapat dimuat.");
  }
}

export async function getConversation(
  conversationId: string
): Promise<ConversationDetail> {
  if (typeof window === "undefined") {
    return getConversationServer({ data: conversationId });
  }

  try {
    const response = await api.get<ApiResponse<ConversationDetail>>(
      `/conversations/${encodeURIComponent(conversationId)}`
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(error, "Percakapan ini tidak dapat dimuat.");
  }
}

export type ConversationStreamHandlers = {
  onActivity(activity: AssistantActivity): void;
  onTextDelta(delta: string): void;
  onTurn(result: SendMessageResult): void;
};

const activitySchema = z.object({
  phase: z.enum([
    "queued",
    "preparing",
    "executing_tool",
    "awaiting_confirmation",
  ]),
  label: z.string(),
});

const conversationSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const messageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.string(),
});

const runSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  assistantMessageId: z.string().nullable(),
  status: z.enum(["queued", "running", "completed", "failed"]),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const toolInvocationSchema = z.object({
  id: z.string(),
  assistantRunId: z.string(),
  name: z.string(),
  label: z.string(),
  status: z.enum([
    "pending",
    "running",
    "awaiting_confirmation",
    "completed",
    "failed",
    "rejected",
  ]),
  objectId: z.string().nullable(),
  objectType: z
    .enum(["task", "reminder", "category", "category_confirmation"])
    .nullable(),
  state: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()])
    )
    .nullable(),
  output: z.json(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const sendMessageResultSchema = z.object({
  conversation: conversationSchema,
  userMessage: messageSchema,
  assistantMessage: messageSchema.nullable(),
  assistantRun: runSchema,
  toolInvocations: z.array(toolInvocationSchema),
});

const streamPartSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("data-activity"), data: activitySchema }),
  z.object({ type: z.literal("data-turn"), data: sendMessageResultSchema }),
  z.object({ type: z.literal("text-delta"), delta: z.string() }),
  z.object({ type: z.literal("error"), errorText: z.string() }),
]);

async function consumeUIMessageStream(
  stream: ReadableStream<Uint8Array>,
  handlers: ConversationStreamHandlers
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += value ? decoder.decode(value, { stream: !done }) : "";
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const data = event
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");

      if (!data || data === "[DONE]") continue;
      const parsed = streamPartSchema.safeParse(JSON.parse(data) as unknown);
      if (!parsed.success) continue;
      const part = parsed.data;
      if (part.type === "data-activity") handlers.onActivity(part.data);
      else if (part.type === "data-turn") handlers.onTurn(part.data);
      else if (part.type === "text-delta") handlers.onTextDelta(part.delta);
      else throw new Error(part.errorText);
    }

    if (done) break;
  }
}

export async function sendConversationMessage(
  values: SendMessageVariables,
  handlers: ConversationStreamHandlers
): Promise<SendMessageResult> {
  let finalResult: SendMessageResult | undefined;

  try {
    const response = await api.post<ReadableStream<Uint8Array>>(
      "/conversations/messages/stream",
      values,
      { adapter: "fetch", responseType: "stream" }
    );

    await consumeUIMessageStream(response.data, {
      ...handlers,
      onTurn: (result) => {
        finalResult = result;
        handlers.onTurn(result);
      },
    });
    if (!finalResult) throw new Error("Respons Sydia tidak lengkap.");

    return finalResult;
  } catch (error) {
    throw toApiError(
      error,
      "Pesan tidak dapat dikirim. Periksa koneksi Anda, lalu coba lagi."
    );
  }
}

export async function retryAssistantRun({
  conversationId,
  runId,
}: RetryAssistantRunVariables): Promise<RetryAssistantRunResult> {
  try {
    const response = await api.post<ApiResponse<RetryAssistantRunResult>>(
      `/conversations/${encodeURIComponent(conversationId)}/runs/${encodeURIComponent(runId)}/retry`
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(
      error,
      "Jawaban belum dapat dicoba lagi. Periksa koneksi Anda, lalu ulangi."
    );
  }
}

export async function deleteConversation(
  conversationId: string
): Promise<void> {
  try {
    await api.delete(`/conversations/${encodeURIComponent(conversationId)}`);
  } catch (error) {
    throw toApiError(
      error,
      "Percakapan tidak dapat dihapus. Periksa koneksi Anda, lalu coba lagi."
    );
  }
}
