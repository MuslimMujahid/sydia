import type { ConversationSummary } from "@/lib/services/api/conversations/conversations.api";
import type { SupportedLocale } from "@/lib/services/api/users/users.api";

export function matchingConversations(
  conversations: ConversationSummary[],
  search: string,
  locale: SupportedLocale
): ConversationSummary[] {
  const term = search.trim().toLocaleLowerCase(locale);
  if (!term) return conversations;

  return conversations.filter(({ title, lastMessagePreview }) =>
    [title, lastMessagePreview].some((value) =>
      value?.toLocaleLowerCase(locale).includes(term)
    )
  );
}
