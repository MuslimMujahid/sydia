import { createFileRoute } from "@tanstack/react-router";
import { SecretsPage } from "@/components/secrets/secrets-page";

export const Route = createFileRoute("/_app/secrets")({
  head: () => ({
    meta: [
      { title: "Rahasia · Sydia" },
      {
        name: "description",
        content: "Kelola rahasia terenkripsi dan tautan ungkap sekali pakai.",
      },
    ],
  }),
  component: SecretsPage,
});
