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
  "pending" | "running" | "completed" | "failed" | "rejected";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type ToolInvocation = {
  id: string;
  assistantRunId: string;
  name: string;
  label: string;
  status: ToolInvocationStatus;
  objectId: string | null;
  objectType: "task" | "reminder" | "contact" | "calendar_event" | null;
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

export async function sendConversationMessage(
  values: SendMessageVariables
): Promise<SendMessageResult> {
  try {
    const response = await api.post<ApiResponse<SendMessageResult>>(
      "/conversations/messages",
      values
    );

    return response.data.data;
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
