import {
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { userQueryKeys } from "../users/users.queries";
import {
  deleteConversation,
  getConversation,
  getConversations,
  retryAssistantRun,
  sendConversationMessage,
  type ConversationDetail,
  type ConversationMessage,
  type ConversationStreamHandlers,
  type ConversationSummary,
  type RetryAssistantRunResult,
  type SendMessageResult,
  type SendMessageVariables,
  type ToolInvocation,
} from "./conversations.api";

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
    queryFn: ({ signal }) => getConversation(conversationId, signal),
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
  messages: (ConversationMessage | null)[]
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

/** A timezone the assistant changed in chat must reach the cached profile. */
function refreshProfileAfterTimezoneChange(
  queryClient: QueryClient,
  invocations: ToolInvocation[]
) {
  if (
    invocations.some(
      ({ name, status }) => name === "set_timezone" && status === "completed"
    )
  ) {
    return queryClient.invalidateQueries({
      queryKey: userQueryKeys.current(),
      refetchType: "all",
    });
  }
}

// Sydia may have created or changed anything; refresh the domain lists too.
const assistantTouchedKeys = [
  conversationQueryKeys.all,
  ["tasks"] as const,
  ["today"] as const,
  ["reminders"] as const,
  ["calendar"] as const,
  ["notes"] as const,
  ["daily-notes"] as const,
  ["records"] as const,
  ["documents"] as const,
  ["file-library"] as const,
  ["contacts"] as const,
  ["contact-groups"] as const,
  ["categories"] as const,
  ["secrets"] as const,
];

export function useSendConversationMessage(
  handlers: Omit<ConversationStreamHandlers, "onTurn"> & {
    onTurn?(result: SendMessageResult): void;
  }
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      values,
      signal,
    }: {
      values: SendMessageVariables;
      signal?: AbortSignal;
    }) =>
      sendConversationMessage(
        values,
        {
          ...handlers,
          onTurn: (result) => {
            cacheSendResult(queryClient, result);
            handlers.onTurn?.(result);
          },
        },
        signal
      ),
    onSuccess: (result) =>
      refreshProfileAfterTimezoneChange(queryClient, result.toolInvocations),
    meta: { invalidateQueries: assistantTouchedKeys },
  });
}

export function useRetryAssistantRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: retryAssistantRun,
    onSuccess: (result) => {
      cacheRetryResult(queryClient, result);

      return refreshProfileAfterTimezoneChange(
        queryClient,
        result.toolInvocations
      );
    },
    meta: { invalidateQueries: assistantTouchedKeys },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteConversation,
    onSuccess: (_result, conversationId) => {
      queryClient.setQueryData<ConversationSummary[]>(
        conversationQueryKeys.list(),
        (current) => current?.filter((item) => item.id !== conversationId)
      );
      queryClient.removeQueries({
        queryKey: conversationQueryKeys.detail(conversationId),
      });
    },
    meta: { invalidateQueries: [conversationQueryKeys.all] },
  });
}
