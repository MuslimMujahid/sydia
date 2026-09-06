import { createFileRoute } from "@tanstack/react-router";
import { CalendarPage } from "@/components/calendar/calendar-page";

export const Route = createFileRoute("/_app/calendar")({
  head: () => ({
    meta: [
      { title: "Kalender · Sydia" },
      {
        name: "description",
        content: "Tinjau agenda dan kelola koneksi Google Calendar di Sydia.",
      },
    ],
  }),
  component: CalendarRoute,
});

function CalendarRoute() {
  const user = Route.useRouteContext();
  return <CalendarPage timezone={user.timezone} />;
}
