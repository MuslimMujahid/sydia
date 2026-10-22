import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { Route as CheckoutRoute } from "../src/routes/checkout";
import "../src/styles/globals.css";

// Mounts the real /checkout route (guards, summary, hand-off) in isolation;
// the specs supply the API responses.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const rootRoute = createRootRoute();
const checkout = CheckoutRoute.update({
  id: "/checkout",
  path: "/checkout",
  getParentRoute: () => rootRoute,
} as never);

const stub = (path: string, title: string) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path,
    component: () => <h1>{title}</h1>,
  });

const router = createRouter({
  routeTree: rootRoute.addChildren([
    checkout,
    stub("/", "Chat Sydia"),
    stub("/settings/billing", "Langganan"),
  ]) as never,
  history: createMemoryHistory({ initialEntries: ["/checkout"] }),
  context: { queryClient } as never,
});

const root = document.getElementById("root");
if (!root) throw new Error("Checkout fixture root is missing");
createRoot(root).render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>
);
