import { fetch } from "expo/fetch";
import { z } from "zod";
import { API_URL } from "@/lib/env";
import { localized } from "@/lib/i18n";
import {
  ApiClientError,
  api,
  authHeaders,
  recheckSession,
  toApiError,
} from "../api";
import type { ApiErrorResponse, ApiResponse } from "../api.types";

export type ChatSource = {
  kind: "file" | "folder" | "note";
  id: string;
  label: string;
  path?: string;
};

export type ChatSegment =
  { type: "text"; text: string } | { type: "source"; source: ChatSource };

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

export type ConversationAttachment = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  kind: string;
  document: { id?: string; title: string } | null;
};

export type ConversationMessage = {
  id: string;
  conversationId: string;
  role: ConversationRole;
  content: string;
  createdAt: string;
  attachments: { fileAsset: ConversationAttachment }[];
  sourceSegments?: ChatSegment[] | null;
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
  "pending" | "running" | "completed" | "failed" | "rejected";

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type ToolInvocation = {
  id: string;
  assistantRunId: string;
  name: string;
  label: string;
  status: ToolInvocationStatus;
  objectId: string | null;
  objectType: "task" | "reminder" | "category" | null;
  state: Record<string, JsonValue> | null;
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
  activeNoteRef?: string;
  sourceSegments?: ChatSegment[];
};

export type AssistantActivityPhase = "queued" | "preparing" | "executing_tool";

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

export async function getConversations(): Promise<ConversationSummary[]> {
  try {
    const response =
      await api.get<ApiResponse<ConversationSummary[]>>("/conversations");

    return response.data.data;
  } catch (error) {
    throw toApiError(
      error,
      localized(
        "Daftar percakapan tidak dapat dimuat.",
        "Conversation list could not be loaded."
      )
    );
  }
}

export async function getConversation(
  conversationId: string,
  signal?: AbortSignal
): Promise<ConversationDetail> {
  try {
    const response = await api.get<ApiResponse<ConversationDetail>>(
      `/conversations/${encodeURIComponent(conversationId)}`,
      { signal }
    );

    return response.data.data;
  } catch (error) {
    throw toApiError(
      error,
      localized(
        "Percakapan ini tidak dapat dimuat.",
        "This conversation could not be loaded."
      )
    );
  }
}

export type ConversationStreamHandlers = {
  onActivity(activity: AssistantActivity): void;
  onTextDelta(delta: string): void;
  onTurn(result: SendMessageResult): void;
};

const activitySchema = z.object({
  phase: z.enum(["queued", "preparing", "executing_tool"]),
  label: z.string(),
});

const conversationSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const attachmentSchema = z.object({
  fileAsset: z.object({
    id: z.string(),
    originalName: z.string(),
    mimeType: z.string(),
    size: z.number(),
    kind: z.string(),
    document: z
      .object({ id: z.string().optional(), title: z.string() })
      .nullable(),
  }),
});

const messageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.string(),
  attachments: z.array(attachmentSchema),
  sourceSegments: z
    .array(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("text"), text: z.string() }),
        z.object({
          type: z.literal("source"),
          source: z.object({
            kind: z.enum(["file", "folder", "note"]),
            id: z.string(),
            label: z.string(),
            path: z.string().optional(),
          }),
        }),
      ])
    )
    .nullable()
    .optional(),
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
  status: z.enum(["pending", "running", "completed", "failed", "rejected"]),
  objectId: z.string().nullable(),
  objectType: z.enum(["task", "reminder", "category"]).nullable(),
  state: z.record(z.string(), z.json()).nullable(),
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

/** Parses the server's UI message stream (SSE `data:` frames). */
export async function consumeUIMessageStream(
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
      // Parts this client does not render (for example channel previews).
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

export function requireTerminalTurn(
  result: SendMessageResult | undefined
): SendMessageResult {
  if (
    !result ||
    (result.assistantRun.status !== "completed" &&
      result.assistantRun.status !== "failed")
  )
    throw new Error(
      localized(
        "Respons Sydia tidak lengkap.",
        "Sydia's response was incomplete."
      )
    );

  return result;
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

/** When a stream drops early, read the persisted run a bounded number of times. */
async function reconcileTerminalTurn(
  streamed: SendMessageResult | undefined,
  signal?: AbortSignal
): Promise<SendMessageResult | undefined> {
  if (!streamed) return undefined;
  if (
    streamed.assistantRun.status === "completed" ||
    streamed.assistantRun.status === "failed"
  )
    return streamed;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      signal?.throwIfAborted();
      const detail = await getConversation(streamed.conversation.id, signal);
      const assistantRun = detail.assistantRuns.find(
        (run) => run.id === streamed.assistantRun.id
      );

      if (
        assistantRun?.status === "completed" ||
        assistantRun?.status === "failed"
      ) {
        const assistantMessage = assistantRun.assistantMessageId
          ? (detail.messages.find(
              (message) => message.id === assistantRun.assistantMessageId
            ) ?? null)
          : null;

        return {
          conversation: detail.conversation,
          userMessage:
            detail.messages.find(
              (message) => message.id === streamed.userMessage.id
            ) ?? streamed.userMessage,
          assistantMessage,
          assistantRun,
          toolInvocations: detail.toolInvocations.filter(
            (invocation) => invocation.assistantRunId === assistantRun.id
          ),
        };
      }
    } catch (error) {
      console.warn("Conversation stream reconciliation failed", {
        attempt: attempt + 1,
        error,
      });
      signal?.throwIfAborted();
      // Bounded degraded mode: try persisted state up to five times, then let
      // requireTerminalTurn surface the incomplete response to the caller.
    }

    if (attempt < 4) await wait(1_000);
  }

  return streamed;
}

async function readErrorEnvelope(
  response: Awaited<ReturnType<typeof fetch>>,
  fallback: string
): Promise<ApiClientError> {
  let payload: ApiErrorResponse | undefined;

  try {
    payload = (await response.json()) as ApiErrorResponse;
  } catch (decodeError) {
    console.warn(
      "Conversation error response could not be decoded",
      decodeError
    );
    // Degraded mode: keep the HTTP status and the connection/retry message.
  }

  if (response.status === 401) recheckSession();

  return new ApiClientError(payload?.error?.message?.trim() || fallback, {
    status: response.status,
    code: payload?.error?.code,
    details: payload?.error?.details,
  });
}

/**
 * Sends a message and streams Sydia's answer. React Native's Axios adapter
 * cannot stream, so this uses `expo/fetch` with the session cookie attached.
 */
export async function sendConversationMessage(
  values: SendMessageVariables,
  handlers: ConversationStreamHandlers,
  signal?: AbortSignal
): Promise<SendMessageResult> {
  const fallback = localized(
    "Pesan tidak dapat dikirim. Periksa koneksi Anda, lalu coba lagi.",
    "Message could not be sent. Check your connection, then try again."
  );
  let finalResult: SendMessageResult | undefined;

  try {
    const response = await fetch(`${API_URL}/conversations/messages/stream`, {
      method: "POST",
      headers: {
        ...(await authHeaders()),
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(values),
      signal,
    });

    if (!response.ok) throw await readErrorEnvelope(response, fallback);
    if (!response.body) throw new Error(fallback);

    let streamError: unknown;

    try {
      await consumeUIMessageStream(response.body, {
        ...handlers,
        onTurn: (result) => {
          finalResult = result;
          handlers.onTurn(result);
        },
      });
    } catch (error) {
      console.warn(
        "Conversation stream failed; checking persisted result",
        error
      );
      streamError = error;
    }

    const reconciled = await reconcileTerminalTurn(finalResult, signal);

    if (
      reconciled &&
      reconciled.assistantRun.status !== finalResult?.assistantRun.status
    )
      handlers.onTurn(reconciled);
    if (streamError && !reconciled) throw streamError;

    return requireTerminalTurn(reconciled);
  } catch (error) {
    throw toApiError(error, fallback);
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
      localized(
        "Jawaban belum dapat dicoba lagi. Periksa koneksi Anda, lalu ulangi.",
        "The answer could not be retried. Check your connection, then try again."
      )
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
      localized(
        "Percakapan tidak dapat dihapus. Periksa koneksi Anda, lalu coba lagi.",
        "Conversation could not be deleted. Check your connection, then try again."
      )
    );
  }
}
