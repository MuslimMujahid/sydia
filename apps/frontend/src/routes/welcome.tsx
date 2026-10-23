import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ErrorState, LoadingState } from "@/components/app-states";
import { WelcomePage } from "@/components/onboarding/welcome-page";
import { requireCompletedOnboarding } from "@/lib/auth";

export const Route = createFileRoute("/welcome")({
  validateSearch: z.object({
    reason: z.enum(["trial", "ready", "paid"]).catch("ready"),
  }),
  beforeLoad: ({ context, location }) =>
    requireCompletedOnboarding(context.queryClient, location.href),
  head: () => ({
    meta: [
      { title: "Selamat datang · Sydia" },
      {
        name: "description",
        content: "Akun Sydia Anda sudah siap digunakan.",
      },
    ],
  }),
  pendingComponent: () => <LoadingState />,
  errorComponent: ({ error, reset }) => (
    <main className="grid min-h-screen place-items-center px-6">
      <ErrorState message={error.message} onRetry={reset} />
    </main>
  ),
  component: WelcomeRoute,
});

function WelcomeRoute() {
  const user = Route.useRouteContext();
  const { reason } = Route.useSearch();

  return <WelcomePage locale={user.locale} reason={reason} />;
}
