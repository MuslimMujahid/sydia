import { createFileRoute } from "@tanstack/react-router";
import { DataSettingsPage } from "@/components/settings/data-page";

export const Route = createFileRoute("/_app/settings/data")({
  head: () => ({
    meta: [
      { title: "Data & akun · Sydia" },
      {
        name: "description",
        content: "Ekspor data, hapus percakapan, atau hapus akun Sydia Anda.",
      },
    ],
  }),
  component: DataSettingsPage,
});
