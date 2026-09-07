import { createFileRoute } from "@tanstack/react-router";
import { IntegrationSettingsPage } from "@/components/settings/integrations-page";

export const Route = createFileRoute("/_app/settings/integrations")({
  head: () => ({
    meta: [
      { title: "Integrasi · Sydia" },
      {
        name: "description",
        content: "Kelola layanan yang terhubung ke akun Sydia Anda.",
      },
    ],
  }),
  component: IntegrationSettingsPage,
});
