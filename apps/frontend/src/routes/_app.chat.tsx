import { createFileRoute } from "@tanstack/react-router";
import { ChatPage } from "@/components/chat/chat-page";

export const Route = createFileRoute("/_app/chat")({
  head: () => ({
    meta: [
      { title: "Chat · Sydia" },
      {
        name: "description",
        content: "Kirim pesan dan lanjutkan percakapan Anda dengan Sydia.",
      },
    ],
  }),
  component: ChatPage,
});
