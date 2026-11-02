import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ErrorState, LoadingState } from "@/components/app-states";
import { requireCompletedOnboarding } from "@/lib/auth";
import { DevToolbar } from "@/components/dev/dev-toolbar";
import { sendAttribution } from "@/lib/attribution";

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

  useEffect(() => {
    void sendAttribution();
  }, []);

  return (
    <DashboardShell user={user}>
      <Outlet />
      {/* eslint-disable-next-line turbo/no-undeclared-env-vars -- Vite build-time constant. */}
      {import.meta.env.DEV ? <DevToolbar locale={user.locale} /> : null}
    </DashboardShell>
  );
}
