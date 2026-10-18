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
import { ChatPage } from "../src/components/chat/chat-page";
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

const index = createRoute({
  getParentRoute: () => app,
  path: "/",
  component: () => (
    <div className="h-dvh">
      <ChatPage conversationId="conversation-1" locale="id" />
    </div>
  ),
});

const notes = createRoute({
  getParentRoute: () => app,
  path: "/notes",
  component: () => <h1>Notes workspace</h1>,
});

const router = createRouter({
  routeTree: root.addChildren([app.addChildren([index, notes])]),
  history: createMemoryHistory({ initialEntries: ["/"] }),
});

const container = document.getElementById("root");
if (!container) throw new Error("Chat notes fixture root is missing");
createRoot(container).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>
);
