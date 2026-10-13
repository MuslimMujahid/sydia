import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { isCalendarView } from "../src/components/calendar/calendar-date";
import { CalendarPage } from "../src/components/calendar/calendar-page";
import { IntegrationSettingsPage } from "../src/components/settings/integrations-page";
import { WhatsAppIntegrationCard } from "../src/components/settings/whatsapp-page";
import { Card } from "../src/components/ui/card";
import { createQueryClient } from "../src/lib/query-client";
import "../src/styles/globals.css";

function CalendarSyncFixture() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  const view = params.get("view");

  if (mode === "whatsapp")
    return (
      <Card className="max-w-3xl p-6 sm:p-8">
        <WhatsAppIntegrationCard />
      </Card>
    );

  if (mode === "calendar")
    return (
      <CalendarPage
        timezone="Asia/Makassar"
        view={isCalendarView(view) ? view : "schedule"}
        date="2026-10-08"
        modeSwitch={null}
        onNavigate={() => {}}
        onTaskIdChange={() => {}}
      />
    );

  return <IntegrationSettingsPage />;
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Calendar sync fixture root is missing.");

createRoot(rootElement).render(
  <QueryClientProvider client={createQueryClient()}>
    <CalendarSyncFixture />
  </QueryClientProvider>
);
