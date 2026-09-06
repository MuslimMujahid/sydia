import { createFileRoute } from "@tanstack/react-router";
import { ContactPage } from "@/components/contacts/contact-page";

export const Route = createFileRoute("/_app/contacts")({
  head: () => ({
    meta: [
      { title: "Kontak · Sydia" },
      {
        name: "description",
        content: "Kelola kontak dan nama lain yang dikenali Sydia.",
      },
    ],
  }),
  component: ContactPage,
});
