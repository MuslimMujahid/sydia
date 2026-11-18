import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/admin-shell";
import { LoadingState } from "@/components/app-states";
import { requireAdminSession } from "@/lib/auth";

export const Route = createFileRoute("/admin")({
  beforeLoad: ({ context, location }) =>
    requireAdminSession(context.queryClient, location.href),
  pendingComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <LoadingState label="Memuat dasbor admin…" />
    </div>
  ),
  component: AdminLayout,
});

function AdminLayout() {
  const admin = Route.useRouteContext();

  return (
    <AdminShell user={admin}>
      <Outlet />
    </AdminShell>
  );
}
