import {
  sendConversationMessage,
  type ChatPreviewChannel,
  type ConversationStreamHandlers,
  type SendMessageVariables,
} from "./conversations.api";

/** Thin channel wrappers exercise the same transport and endpoint as normal chat. */
export function createChatPreviewClient(
  channel: ChatPreviewChannel,
  sessionId: string
) {
  const scope = { previewSessionId: sessionId, previewChannel: channel };

  return {
    scope,
    key: ["chat-preview", sessionId, channel] as const,
    send: (
      values: SendMessageVariables,
      handlers: ConversationStreamHandlers,
      signal?: AbortSignal
    ) => sendConversationMessage({ ...values, ...scope }, handlers, signal),
  };
}

export const webChatPreview = (sessionId: string) =>
  createChatPreviewClient("web", sessionId);
export const telegramChatPreview = (sessionId: string) =>
  createChatPreviewClient("telegram", sessionId);
export const whatsAppChatPreview = (sessionId: string) =>
  createChatPreviewClient("whatsapp", sessionId);
