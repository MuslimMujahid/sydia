import { createRoot } from "react-dom/client";
import {
  createRouter,
  createRootRoute,
  createRoute,
  RouterProvider,
  Outlet,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { AdminShell } from "../src/components/admin/admin-shell";
import { SummaryPage } from "../src/components/admin/summary/summary-page";
import { UsagePage } from "../src/components/admin/usage/usage-page";
import { CostsPage } from "../src/components/admin/costs/costs-page";
import {
  ACTIVITY_FEATURES,
  DEFAULT_PERIOD,
  periodSearch,
} from "../src/components/admin/analytics/meta";
import type {
  ActivityFeature,
  AdminPeriod,
} from "../src/components/admin/types";
import {
  adminCostsQueryOptions,
  adminSummaryQueryOptions,
  adminUsageQueryOptions,
} from "../src/lib/services/api/admin/admin.queries";
import { createQueryClient } from "../src/lib/query-client";
import type { UserProfile } from "../src/lib/services/api/users/users.queries";
import "../src/styles/globals.css";

const client = createQueryClient();
client.setDefaultOptions({ queries: { retry: false } });
const user = {
  id: "admin",
  name: "Admin Sydia",
  email: "admin@example.test",
} as UserProfile;

type Search = { period?: AdminPeriod; feature?: ActivityFeature };

/** The admin routes' wiring, against whichever fixture route is mounted. */
function useAnalyticsSearch() {
  const search = useSearch({ strict: false }) as Search;
  const navigate = useNavigate();
  const period = search.period ?? DEFAULT_PERIOD;

  return {
    period,
    feature: search.feature ?? null,
    setSearch: (next: Search) =>
      void navigate({
        to: ".",
        search: (previous: Search) => ({ ...previous, ...next }),
      }),
  };
}

function Summary() {
  const { period, setSearch } = useAnalyticsSearch();
  const query = useQuery(adminSummaryQueryOptions(period));

  return (
    <SummaryPage
      period={period}
      onPeriodChange={(next) => setSearch({ period: next })}
      data={query.data}
      error={query.error}
      isFetching={query.isFetching}
      onRetry={() => void query.refetch()}
    />
  );
}

function Usage() {
  const { period, feature, setSearch } = useAnalyticsSearch();
  const query = useQuery(adminUsageQueryOptions(period));

  return (
    <UsagePage
      period={period}
      onPeriodChange={(next) => setSearch({ period: next })}
      data={query.data}
      error={query.error}
      isFetching={query.isFetching}
      onRetry={() => void query.refetch()}
      feature={feature}
      onFeatureChange={(next) => setSearch({ feature: next ?? undefined })}
    />
  );
}

function Costs() {
  const { period, setSearch } = useAnalyticsSearch();
  const query = useQuery(adminCostsQueryOptions(period));

  return (
    <CostsPage
      period={period}
      onPeriodChange={(next) => setSearch({ period: next })}
      data={query.data}
      error={query.error}
      isFetching={query.isFetching}
      onRetry={() => void query.refetch()}
    />
  );
}

const rootRoute = createRootRoute({
  component: () => (
    <AdminShell user={user}>
      <Outlet />
    </AdminShell>
  ),
});

const searchWithFeature = (search: Record<string, unknown>): Search => ({
  ...periodSearch(search),
  ...(ACTIVITY_FEATURES.includes(search.feature as ActivityFeature)
    ? { feature: search.feature as ActivityFeature }
    : {}),
});

const routes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/e2e/admin-dashboard.html",
    validateSearch: periodSearch,
    component: Summary,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin",
    validateSearch: periodSearch,
    component: Summary,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/usage",
    validateSearch: searchWithFeature,
    component: Usage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/costs",
    validateSearch: periodSearch,
    component: Costs,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/users",
    component: () => <p>Daftar pengguna terfilter</p>,
    validateSearch: (s: Record<string, unknown>) => s,
  }),
];

const router = createRouter({ routeTree: rootRoute.addChildren(routes) });

const element = document.getElementById("root");
if (!element) throw new Error("Admin dashboard fixture root missing");
createRoot(element).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>
);
