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
import { Route as ReceiptRoute } from "../src/routes/receipt.$orderId";
import { Route as WelcomeRoute } from "../src/routes/welcome";
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

const receipt = ReceiptRoute.update({
  id: "/receipt/$orderId",
  path: "/receipt/$orderId",
  getParentRoute: () => rootRoute,
} as never);

const welcome = WelcomeRoute.update({
  id: "/welcome",
  path: "/welcome",
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
    receipt,
    welcome,
    stub("/", "Chat Sydia"),
    stub("/settings/billing", "Langganan"),
  ]) as never,
  history: createMemoryHistory({
    initialEntries: [
      new URLSearchParams(window.location.search).get("to") ?? "/checkout",
    ],
  }),
  context: { queryClient } as never,
});

const root = document.getElementById("root");
if (!root) throw new Error("Checkout fixture root is missing");
createRoot(root).render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>
);
