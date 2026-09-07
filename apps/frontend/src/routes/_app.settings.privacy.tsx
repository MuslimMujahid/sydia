import { createFileRoute } from "@tanstack/react-router";
import { PrivacySettingsPage } from "@/components/settings/privacy-page";

export const Route = createFileRoute("/_app/settings/privacy")({
  head: () => ({
    meta: [
      { title: "Memori & privasi · Sydia" },
      {
        name: "description",
        content: "Kendalikan memori otomatis dan retensi data Sydia.",
      },
    ],
  }),
  component: PrivacySettingsPage,
});
