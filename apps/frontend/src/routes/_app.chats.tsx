import { createFileRoute, notFound } from "@tanstack/react-router";
import { ChatPreviewsPage } from "@/components/chat/chat-previews-page";

export const Route = createFileRoute("/_app/chats")({
  beforeLoad: () => {
    // eslint-disable-next-line turbo/no-undeclared-env-vars -- Vite build-time constant, not a process environment variable.
    if (!import.meta.env.DEV) throw notFound();
  },
  head: () => ({ meta: [{ title: "Chat previews · Sydia" }] }),
  component: ChatsRoute,
});

function ChatsRoute() {
  const user = Route.useRouteContext();

  return <ChatPreviewsPage locale={user.locale} timezone={user.timezone} />;
}
