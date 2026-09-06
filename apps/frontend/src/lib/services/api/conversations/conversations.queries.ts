import {
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  getConversation,
  getConversations,
  retryAssistantRun,
  sendConversationMessage,
  type AssistantRun,
  type ConversationDetail,
  type ConversationMessage,
  type RetryAssistantRunResult,
  type SendMessageResult,
  type ToolInvocation,
} from "./conversations.api";
import { resolveToolConfirmation } from "./confirmations.api";

export const conversationQueryKeys = {
  all: ["conversations"] as const,
  list: () => ["conversations", "list"] as const,
  detail: (conversationId: string) =>
    ["conversations", "detail", conversationId] as const,
};

export const conversationsQueryOptions = () =>
  queryOptions({
    queryKey: conversationQueryKeys.list(),
    queryFn: getConversations,
    staleTime: 15_000,
  });

export const conversationQueryOptions = (conversationId: string) =>
  queryOptions({
    queryKey: conversationQueryKeys.detail(conversationId),
    queryFn: () => getConversation(conversationId),
    enabled: Boolean(conversationId),
    refetchInterval: (query) =>
      query.state.data?.assistantRuns.some(
        (run) => run.status === "queued" || run.status === "running"
      )
        ? 1_500
        : false,
  });

function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const values = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) values.set(item.id, item);

  return [...values.values()];
}

function sortByCreatedAt<T extends { createdAt: string }>(values: T[]): T[] {
  return [...values].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt)
  );
}

function mergeConversationResult(
  current: ConversationDetail | undefined,
  result: SendMessageResult | RetryAssistantRunResult,
  messages: Array<ConversationMessage | null>
): ConversationDetail {
  return {
    conversation: result.conversation,
    messages: sortByCreatedAt(
      mergeById(
        current?.messages ?? [],
        messages.filter(
          (message): message is ConversationMessage => message !== null
        )
      )
    ),
    assistantRuns: sortByCreatedAt(
      mergeById(current?.assistantRuns ?? [], [result.assistantRun])
    ),
    toolInvocations: sortByCreatedAt(
      mergeById(current?.toolInvocations ?? [], result.toolInvocations)
    ),
  };
}

function cacheSendResult(queryClient: QueryClient, result: SendMessageResult) {
  queryClient.setQueryData<ConversationDetail>(
    conversationQueryKeys.detail(result.conversation.id),
    (current) =>
      mergeConversationResult(current, result, [
        result.userMessage,
        result.assistantMessage,
      ])
  );
}

function cacheRetryResult(
  queryClient: QueryClient,
  result: RetryAssistantRunResult
) {
  queryClient.setQueryData<ConversationDetail>(
    conversationQueryKeys.detail(result.conversation.id),
    (current) =>
      mergeConversationResult(current, result, [result.assistantMessage])
  );
}

export function useSendConversationMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: sendConversationMessage,
    onSuccess: (result) => cacheSendResult(queryClient, result),
    meta: { invalidateQueries: [conversationQueryKeys.all] },
  });
}

export function useRetryAssistantRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: retryAssistantRun,
    onSuccess: (result) => cacheRetryResult(queryClient, result),
    meta: { invalidateQueries: [conversationQueryKeys.all] },
  });
}

export function useResolveToolConfirmation() {
  return useMutation({
    mutationFn: resolveToolConfirmation,
    meta: {
      invalidateQueries: [
        conversationQueryKeys.all,
        ["categories"] as const,
        ["tasks"] as const,
      ],
    },
  });
}

export type {
  AssistantRun,
  ConversationDetail,
  ConversationMessage,
  ToolInvocation,
};
