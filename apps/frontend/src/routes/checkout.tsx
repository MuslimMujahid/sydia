import { createFileRoute } from "@tanstack/react-router";
import { CheckoutPage } from "@/components/billing/checkout-page";
import { ErrorState, LoadingState } from "@/components/app-states";
import { requireCompletedOnboarding } from "@/lib/auth";

export const Route = createFileRoute("/checkout")({
  beforeLoad: ({ context, location }) =>
    requireCompletedOnboarding(context.queryClient, location.href),
  head: () => ({
    meta: [
      { title: "Berlangganan · Sydia" },
      {
        name: "description",
        content: "Tinjau pesanan dan selesaikan pembayaran langganan Sydia.",
      },
    ],
  }),
  pendingComponent: () => <LoadingState />,
  errorComponent: ({ error, reset }) => (
    <main className="grid min-h-screen place-items-center px-6">
      <ErrorState message={error.message} onRetry={reset} />
    </main>
  ),
  component: CheckoutRoute,
});

function CheckoutRoute() {
  const user = Route.useRouteContext();

  return <CheckoutPage locale={user.locale} timezone={user.timezone} />;
}
