import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ErrorState, LoadingState } from "@/components/app-states";
import { requireCompletedOnboarding } from "@/lib/auth";

export const Route = createFileRoute("/_app")({
  beforeLoad: ({ context, location }) =>
    requireCompletedOnboarding(context.queryClient, location.href),
  pendingComponent: () => <LoadingState />,
  errorComponent: ({ error, reset }) => (
    <main className="grid min-h-screen place-items-center px-6">
      <ErrorState message={error.message} onRetry={reset} />
    </main>
  ),
  component: AppLayout,
});

function AppLayout() {
  const user = Route.useRouteContext();

  return (
    <DashboardShell user={user}>
      <Outlet />
    </DashboardShell>
  );
}
