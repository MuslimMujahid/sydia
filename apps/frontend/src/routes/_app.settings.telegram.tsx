import { createFileRoute } from "@tanstack/react-router";
import { UserTelegramSettingsPage } from "@/components/settings/telegram-page";

export const Route = createFileRoute("/_app/settings/telegram")({
  head: () => ({
    meta: [
      { title: "Telegram · Sydia" },
      {
        name: "description",
        content: "Tautkan akun Telegram pribadi Anda ke akun Sydia.",
      },
    ],
  }),
  component: UserTelegramSettingsPage,
});
