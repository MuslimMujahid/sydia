import { createFileRoute } from "@tanstack/react-router";
import { BillingPage } from "@/components/settings/billing-page";

export const Route = createFileRoute("/_app/settings/billing")({
  head: () => ({
    meta: [
      { title: "Langganan · Sydia" },
      {
        name: "description",
        content: "Kelola langganan, pembayaran, dan penyimpanan Sydia.",
      },
    ],
  }),
  component: BillingRoute,
});

function BillingRoute() {
  const user = Route.useRouteContext();

  return <BillingPage locale={user.locale} timezone={user.timezone} />;
}
