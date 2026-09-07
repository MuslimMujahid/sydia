import { createFileRoute } from "@tanstack/react-router";
import { UserWhatsAppSettingsPage } from "@/components/settings/whatsapp-page";

export const Route = createFileRoute("/_app/settings/whatsapp")({
  head: () => ({
    meta: [
      { title: "WhatsApp · Sydia" },
      {
        name: "description",
        content: "Tautkan nomor WhatsApp pribadi Anda ke akun Sydia.",
      },
    ],
  }),
  component: UserWhatsAppSettingsPage,
});
