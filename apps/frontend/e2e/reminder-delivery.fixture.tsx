import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { ReminderDeliveryNotice } from "../src/components/reminders/reminder-delivery-notice";
import "../src/styles/globals.css";

function Fixture() {
  return (
    <main className="space-y-4 p-4">
      <p>Pengingat</p>
      <ReminderDeliveryNotice />
    </main>
  );
}

const rootRoute = createRootRoute();
const routes = ["/", "/settings/integrations", "/settings/notifications"].map(
  (path) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: Fixture,
    })
);

const router = createRouter({
  routeTree: rootRoute.addChildren(routes),
  history: createMemoryHistory({ initialEntries: ["/"] }),
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const root = document.getElementById("root");
if (!root) throw new Error("Reminder delivery fixture root is missing");
createRoot(root).render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>
);
