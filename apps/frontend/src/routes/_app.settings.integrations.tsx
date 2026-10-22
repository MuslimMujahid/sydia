import { createFileRoute } from "@tanstack/react-router";
import {
  IntegrationSettingsPage,
  type CalendarAuthorizationResult,
} from "@/components/settings/integrations-page";

export const Route = createFileRoute("/_app/settings/integrations")({
  validateSearch: (
    search: Record<string, unknown>
  ): {
    googleCalendar?: CalendarAuthorizationResult;
  } => ({
    googleCalendar:
      search.googleCalendar === "connected" ||
      search.googleCalendar === "denied" ||
      search.googleCalendar === "failed" ||
      search.googleCalendar === "needs_offline_consent"
        ? search.googleCalendar
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Integrasi · Sydia" },
      {
        name: "description",
        content: "Kelola layanan yang terhubung ke akun Sydia Anda.",
      },
    ],
  }),
  component: IntegrationsRoute,
});

function IntegrationsRoute() {
  const { googleCalendar } = Route.useSearch();

  return <IntegrationSettingsPage calendarAuthorization={googleCalendar} />;
}
