import { QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { z } from "zod";
import { EmptyState } from "../src/components/app-states";
import { ChatPage } from "../src/components/chat/chat-page";
import { TryInChat } from "../src/components/chat/try-in-chat";
import { BellGlyph, TaskListGlyph } from "../src/components/ui/glyphs";
import { createQueryClient } from "../src/lib/query-client";
import "../src/styles/globals.css";

const client = createQueryClient();
client.setDefaultOptions({
  queries: { retry: false },
  mutations: { retry: false },
});
const root = createRootRoute({ component: Outlet });
const app = createRoute({
  getParentRoute: () => root,
  id: "_app",
  beforeLoad: () => ({ timezone: "Asia/Makassar", id: "demo" }),
  component: Outlet,
});

const chat = createRoute({
  getParentRoute: () => app,
  path: "/",
  validateSearch: z.object({ draft: z.string().optional() }),
  component: function ChatRoute() {
    const { draft } = chat.useSearch();

    return (
      <div className="h-dvh">
        <ChatPage locale="id" initialDraft={draft} />
      </div>
    );
  },
});

const empty = createRoute({
  getParentRoute: () => app,
  path: "/empty",
  component: () => (
    <main className="mx-auto max-w-3xl space-y-10 px-5 py-8">
      <EmptyState
        align="center"
        icon={<BellGlyph hue="amber" />}
        title="Belum ada pengingat"
        message="Pengingat dari chat atau tombol + akan muncul di sini."
        action={<TryInChat topic="reminder" />}
      />
      <EmptyState
        align="center"
        icon={<TaskListGlyph hue="violet" />}
        title="Belum ada tugas"
        message="Tugas dari chat atau tombol + akan muncul di sini."
        action={<TryInChat topic="task" />}
      />
    </main>
  ),
});

const router = createRouter({
  routeTree: root.addChildren([app.addChildren([chat, empty])]),
  history: createMemoryHistory({ initialEntries: ["/empty"] }),
});

const container = document.getElementById("root");
if (!container) throw new Error("Try in chat fixture root is missing");
createRoot(container).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>
);
