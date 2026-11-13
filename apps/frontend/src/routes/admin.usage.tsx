import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { UsagePage } from "@/components/admin/usage/usage-page";
import {
  ACTIVITY_FEATURES,
  DEFAULT_PERIOD,
  periodSearch,
} from "@/components/admin/analytics/meta";
import type { ActivityFeature } from "@/components/admin/types";
import { adminUsageQueryOptions } from "@/lib/services/api/admin/admin.queries";

export const Route = createFileRoute("/admin/usage")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...periodSearch(search),
    ...(ACTIVITY_FEATURES.includes(search.feature as ActivityFeature)
      ? { feature: search.feature as ActivityFeature }
      : {}),
  }),
  head: () => ({ meta: [{ title: "Penggunaan · Sydia Admin" }] }),
  component: UsageRoute,
});

function UsageRoute() {
  const { period = DEFAULT_PERIOD, feature } = Route.useSearch();
  const navigate = Route.useNavigate();
  const query = useQuery(adminUsageQueryOptions(period));

  return (
    <UsagePage
      period={period}
      onPeriodChange={(next) =>
        void navigate({ search: (prev) => ({ ...prev, period: next }) })
      }
      data={query.data}
      error={query.error}
      isFetching={query.isFetching}
      onRetry={() => void query.refetch()}
      feature={feature ?? null}
      onFeatureChange={(next) =>
        void navigate({
          search: (prev) => ({ ...prev, feature: next ?? undefined }),
        })
      }
    />
  );
}
