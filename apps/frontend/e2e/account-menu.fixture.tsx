import { createRoot } from "react-dom/client";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { AccountMenu } from "../src/components/dashboard/account-menu";
import type { BillingStatus } from "../src/lib/services/api/billing/billing.api";
import "../src/styles/globals.css";

const params = new URLSearchParams(window.location.search);
const NOW = Date.parse("2026-10-24T00:00:00Z");

const base: BillingStatus = {
  enforced: true,
  active: true,
  state: "trial",
  trialEndsAt: "2026-10-29T00:00:00Z",
  paidUntil: null,
  lastActivatedAt: "2026-10-22T00:00:00Z",
  checkoutEnabled: true,
  environment: "sandbox",
  normalPrice: 59_000,
  price: 29_000,
  durationDays: 30,
  trialDays: 7,
  storage: {
    usedBytes: 1_500_000_000,
    limitBytes: 10_000_000_000,
    maxFileBytes: 100_000_000,
  },
};

const scenarios: Record<string, BillingStatus | undefined> = {
  trial: base,
  paid: { ...base, state: "paid", paidUntil: "2026-11-21T00:00:00Z" },
  ending: { ...base, state: "paid", paidUntil: "2026-10-26T00:00:00Z" },
  expired: { ...base, state: "expired", active: false },
  unavailable: { ...base, checkoutEnabled: false },
  unenforced: { ...base, enforced: false },
  none: undefined,
};

const user = {
  id: "user-1",
  name: "muhammad hidayat",
  email: "mrdevip15@gmail.com",
  timezone: "Asia/Jakarta",
  locale: "id" as const,
  onboardingCompleted: true,
  role: "user",
};

function Fixture() {
  return (
    <main className="flex min-h-screen items-end p-4">
      <div className="w-72 border-t border-hairline pt-3">
        <AccountMenu
          user={user}
          billing={scenarios[params.get("plan") ?? "trial"]}
          collapsed={params.get("collapsed") === "1"}
          signingOut={false}
          onSignOut={() => undefined}
          now={() => NOW}
        />
      </div>
    </main>
  );
}

const rootRoute = createRootRoute();
const routes = ["/", "/settings/profile", "/settings/billing"].map((path) =>
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

const root = document.getElementById("root");
if (!root) throw new Error("Account menu fixture root is missing");
createRoot(root).render(<RouterProvider router={router} />);
