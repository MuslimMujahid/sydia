import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { Route as OnboardingRoute } from "../src/routes/onboarding";
import { Route as WelcomeRoute } from "../src/routes/welcome";
import "../src/styles/globals.css";

// Mounts the real /onboarding route (loader, guards, wizard) in isolation;
// the specs supply the API responses.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const rootRoute = createRootRoute();
const onboarding = OnboardingRoute.update({
  id: "/onboarding",
  path: "/onboarding",
  getParentRoute: () => rootRoute,
} as never);

const welcome = WelcomeRoute.update({
  id: "/welcome",
  path: "/welcome",
  getParentRoute: () => rootRoute,
} as never);

const home = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <h1>Chat Sydia</h1>,
});

const router = createRouter({
  routeTree: rootRoute.addChildren([onboarding, welcome, home]) as never,
  history: createMemoryHistory({ initialEntries: ["/onboarding"] }),
  context: { queryClient } as never,
});

const root = document.getElementById("root");
if (!root) throw new Error("Onboarding fixture root is missing");
createRoot(root).render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>
);
