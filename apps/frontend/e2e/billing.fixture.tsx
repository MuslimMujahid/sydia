import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { BillingPage } from "../src/components/settings/billing-page";
import { BillingAccessBanner } from "../src/components/settings/billing-access-banner";
import { SettingsNav } from "../src/components/settings/settings-nav";
import "../src/styles/globals.css";

const locale =
  new URLSearchParams(window.location.search).get("lang") === "en"
    ? "en"
    : "id";

function Fixture() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <BillingAccessBanner locale={locale} />
      <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
        <SettingsNav />
        <div className="min-w-0 flex-1">
          <BillingPage
            locale={locale}
            timezone="Asia/Makassar"
            now={() => Date.parse("2026-10-24T00:00:00Z")}
          />
        </div>
      </div>
    </main>
  );
}

const rootRoute = createRootRoute();
const fixture = createRoute({
  getParentRoute: () => rootRoute,
  path: "/e2e/billing.html",
  component: Fixture,
});

const billing = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings/billing",
  component: Fixture,
});

const router = createRouter({
  routeTree: rootRoute.addChildren([fixture, billing]),
});

const root = document.getElementById("root");
if (!root) throw new Error("Billing fixture root is missing");
createRoot(root).render(
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    <RouterProvider router={router} />
  </QueryClientProvider>
);
