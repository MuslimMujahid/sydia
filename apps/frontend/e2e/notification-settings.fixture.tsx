import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Outlet,
} from "@tanstack/react-router";
import { NotificationSettingsPage } from "../src/components/settings/notifications-page";
import "../src/styles/globals.css";

const route = createRootRoute({
  component: () => (
    <>
      <Outlet />
    </>
  ),
});

const index = createRoute({
  getParentRoute: () => route,
  path: "/e2e/notification-settings.html",
  component: () => (
    <main className="p-8">
      <NotificationSettingsPage />
    </main>
  ),
});

const chats = createRoute({
  getParentRoute: () => route,
  path: "/chats",
  component: () => <h1>Chat previews</h1>,
});

const router = createRouter({ routeTree: route.addChildren([index, chats]) });
const root = document.getElementById("root");
if (!root) throw new Error("Notification settings fixture root is missing");
createRoot(root).render(
  <QueryClientProvider client={new QueryClient()}>
    <RouterProvider router={router} />
  </QueryClientProvider>
);
