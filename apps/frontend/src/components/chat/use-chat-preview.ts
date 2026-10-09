import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  retryAssistantRun,
  type AssistantActivity,
  type PreviewFile,
  type SendMessageResult,
  type SendMessageVariables,
} from "@/lib/services/api/conversations/conversations.api";
import type { createChatPreviewClient } from "@/lib/services/api/conversations/chat-preview";

export function useChatPreview(
  client: ReturnType<typeof createChatPreviewClient>
) {
  const [turns, setTurns] = useState<SendMessageResult[]>([]);
  const [text, setText] = useState("");
  const [activity, setActivity] = useState<AssistantActivity>();
  const [files, setFiles] = useState<PreviewFile[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const controller = useRef<AbortController | null>(null);
  const lastRunId = useRef<string | undefined>(undefined);
  useEffect(() => () => controller.current?.abort(), []);

  function updateTurn(result: SendMessageResult) {
    lastRunId.current = result.assistantRun.id;
    setConversationId(result.conversation.id);
    setTurns((current) => {
      const previous = current.findIndex(
        (turn) => turn.assistantRun.id === result.assistantRun.id
      );

      return previous === -1
        ? [...current, result]
        : current.map((turn, index) => (index === previous ? result : turn));
    });
  }

  const mutation = useMutation({
    mutationKey: client.key,
    mutationFn: async (
      values: SendMessageVariables & { retryRun?: SendMessageResult }
    ) => {
      controller.current = new AbortController();
      setText("");
      setActivity(undefined);
      let result: SendMessageResult;

      if (values.retryRun?.assistantRun.status === "failed") {
        const retried = await retryAssistantRun({
          conversationId: values.retryRun.conversation.id,
          runId: values.retryRun.assistantRun.id,
          ...client.scope,
        });

        result = { ...retried, userMessage: values.retryRun.userMessage };
        updateTurn(result);
      } else {
        result = await client.send(
          values,
          {
            onActivity: setActivity,
            onTextDelta: (delta) => setText((current) => current + delta),
            onTurn: updateTurn,
            onPreviewFile: (file) => setFiles((current) => [...current, file]),
          },
          controller.current.signal
        );
      }

      if (result.assistantRun.status === "failed")
        throw new Error(
          result.assistantRun.errorMessage ??
            "This response failed. Retry this channel."
        );

      return result;
    },
    onError: (error) =>
      console.warn("Chat preview response failed", {
        channel: client.scope.previewChannel,
        error,
      }),
  });

  return {
    ...mutation,
    turns,
    text,
    activity,
    files,
    send: (content: string, idempotencyKey: string) =>
      mutation.mutateAsync({ content, idempotencyKey, conversationId }),
    retry: () => {
      if (!mutation.variables) return;
      const retryRun = turns.find(
        (turn) =>
          turn.assistantRun.id === lastRunId.current &&
          turn.assistantRun.status === "failed"
      );

      mutation.mutate({ ...mutation.variables, conversationId, retryRun });
    },
  };
}
