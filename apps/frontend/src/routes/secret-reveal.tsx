import { createFileRoute } from "@tanstack/react-router";
import { SecretRevealPage } from "@/components/secrets/secret-reveal-page";

export const Route = createFileRoute("/secret-reveal")({
  head: () => ({
    meta: [
      { title: "Buka rahasia · Sydia" },
      {
        name: "description",
        content: "Buka rahasia dari tautan sekali pakai.",
      },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: SecretRevealPage,
});
