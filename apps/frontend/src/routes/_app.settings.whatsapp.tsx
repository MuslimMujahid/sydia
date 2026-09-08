import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/whatsapp")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/integrations" });
  },
});
