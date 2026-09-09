import { createFileRoute } from "@tanstack/react-router";
import { NotificationSettingsPage } from "@/components/settings/notifications-page";

export const Route = createFileRoute("/_app/settings/notifications")({
  head: () => ({
    meta: [
      { title: "Notifikasi · Sydia" },
      {
        name: "description",
        content:
          "Kelola kanal notifikasi dan briefing harian Sydia.",
      },
    ],
  }),
  component: NotificationSettingsPage,
});
