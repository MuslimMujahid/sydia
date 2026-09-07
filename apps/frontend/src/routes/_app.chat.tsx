import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ChatPage } from "@/components/chat/chat-page";

const chatSearchSchema = z.object({
  attachment: z.string().optional(),
});

export const Route = createFileRoute("/_app/chat")({
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

  return <ChatPage initialAttachmentId={search.attachment} />;
}
