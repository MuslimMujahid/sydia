import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CostsPage } from "@/components/admin/costs/costs-page";
import {
  DEFAULT_PERIOD,
  periodSearch,
} from "@/components/admin/analytics/meta";
import { adminCostsQueryOptions } from "@/lib/services/api/admin/admin.queries";

export const Route = createFileRoute("/admin/costs")({
  validateSearch: periodSearch,
  head: () => ({ meta: [{ title: "Biaya · Sydia Admin" }] }),
  component: CostsRoute,
});

function CostsRoute() {
  const { period = DEFAULT_PERIOD } = Route.useSearch();
  const navigate = Route.useNavigate();
  const query = useQuery(adminCostsQueryOptions(period));

  return (
    <CostsPage
      period={period}
      onPeriodChange={(next) => void navigate({ search: { period: next } })}
      data={query.data}
      error={query.error}
      isFetching={query.isFetching}
      onRetry={() => void query.refetch()}
    />
  );
}
