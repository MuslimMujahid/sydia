import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ChatPage } from "@/components/chat/chat-page";

const chatSearchSchema = z.object({
  conversation: z.string().optional(),
  attachment: z.string().optional(),
  /** A message to pre-fill, sent from an example on an empty page. */
  draft: z.string().max(500).optional(),
});

export const Route = createFileRoute("/_app/")({
  validateSearch: chatSearchSchema,
  head: () => ({
    meta: [
      { title: "Chat · Sydia" },
      {
        name: "description",
        content: "Kirim pesan dan lanjutkan percakapan Anda dengan Sydia.",
      },
    ],
  }),
  component: ChatRoute,
});

function ChatRoute() {
  const search = Route.useSearch();
  const user = Route.useRouteContext();

  return (
    <ChatPage
      conversationId={search.conversation}
      initialAttachmentId={search.attachment}
      initialDraft={search.draft}
      locale={user.locale}
    />
  );
}
