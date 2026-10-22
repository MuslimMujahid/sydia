import { createFileRoute } from "@tanstack/react-router";
import { ReceiptPage } from "@/components/billing/receipt-page";
import { ErrorState, LoadingState } from "@/components/app-states";
import { requireCompletedOnboarding } from "@/lib/auth";

export const Route = createFileRoute("/receipt/$orderId")({
  beforeLoad: ({ context, location }) =>
    requireCompletedOnboarding(context.queryClient, location.href),
  head: () => ({
    meta: [
      { title: "Struk pembayaran · Sydia" },
      { name: "description", content: "Struk pembayaran langganan Sydia." },
    ],
  }),
  pendingComponent: () => <LoadingState />,
  errorComponent: ({ error, reset }) => (
    <main className="grid min-h-screen place-items-center px-6">
      <ErrorState message={error.message} onRetry={reset} />
    </main>
  ),
  component: ReceiptRoute,
});

function ReceiptRoute() {
  const { orderId } = Route.useParams();
  const user = Route.useRouteContext();

  return (
    <ReceiptPage
      orderId={orderId}
      locale={user.locale}
      timezone={user.timezone}
      name={user.name}
      email={user.email}
    />
  );
}
