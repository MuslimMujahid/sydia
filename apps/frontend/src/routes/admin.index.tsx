import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { DashboardPage } from "@/components/admin/dashboard-page";
import { DomainInlineError } from "@/components/domain/domain-page";
import { adminDashboardQueryOptions } from "@/lib/services/api/admin/admin.queries";
import type { AdminPeriod } from "@/components/admin/types";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Beranda · Sydia Admin" }] }),
  component: AdminHome,
});

function AdminHome() {
  const [period, setPeriod] = useState<AdminPeriod>(30);
  const query = useQuery(adminDashboardQueryOptions(period));
  if (query.isPending)
    return (
      <p aria-busy="true" role="status">
        Memuat dasbor…
      </p>
    );
  if (!query.data)
    return (
      <DomainInlineError
        title="Gagal memuat dasbor"
        message={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );

  return (
    <DashboardPage
      dashboard={query.data}
      period={period}
      onPeriodChange={setPeriod}
      onRefresh={() => void query.refetch()}
      isFetching={query.isFetching}
      refreshError={query.error?.message ?? null}
    />
  );
}
