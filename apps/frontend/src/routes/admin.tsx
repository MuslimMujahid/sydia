import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminSession } from "@/lib/auth";

export const Route = createFileRoute("/admin")({
  beforeLoad: ({ context, location }) =>
    requireAdminSession(context.queryClient, location.href),
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
