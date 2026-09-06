import { createFileRoute } from "@tanstack/react-router";
import { TodayPage } from "@/components/today/today-page";

export const Route = createFileRoute("/_app/")({
  head: () => ({
    meta: [
      { title: "Hari ini · Sydia" },
      { name: "description", content: "Pusat kendali Sydia Anda yang tenang." },
    ],
  }),
  component: TodayRoute,
});

function TodayRoute() {
  const user = Route.useRouteContext();
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;

  return <TodayPage firstName={firstName} />;
}
