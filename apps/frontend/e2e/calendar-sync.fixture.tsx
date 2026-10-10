import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { CalendarPage } from "../src/components/calendar/calendar-page";
import { IntegrationSettingsPage } from "../src/components/settings/integrations-page";
import { createQueryClient } from "../src/lib/query-client";
import "../src/styles/globals.css";

function CalendarSyncFixture() {
  const mode = new URLSearchParams(window.location.search).get("mode");

  if (mode === "calendar")
    return (
      <CalendarPage
        timezone="Asia/Makassar"
        view="schedule"
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
