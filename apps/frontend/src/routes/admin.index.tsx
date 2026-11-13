import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SummaryPage } from "@/components/admin/summary/summary-page";
import {
  DEFAULT_PERIOD,
  periodSearch,
} from "@/components/admin/analytics/meta";
import { adminSummaryQueryOptions } from "@/lib/services/api/admin/admin.queries";

export const Route = createFileRoute("/admin/")({
  validateSearch: periodSearch,
  head: () => ({ meta: [{ title: "Ringkasan · Sydia Admin" }] }),
  component: SummaryRoute,
});

function SummaryRoute() {
  const { period = DEFAULT_PERIOD } = Route.useSearch();
  const navigate = Route.useNavigate();
  const query = useQuery(adminSummaryQueryOptions(period));

  return (
    <SummaryPage
      period={period}
      onPeriodChange={(next) => void navigate({ search: { period: next } })}
      data={query.data}
      error={query.error}
      isFetching={query.isFetching}
      onRetry={() => void query.refetch()}
    />
  );
}
