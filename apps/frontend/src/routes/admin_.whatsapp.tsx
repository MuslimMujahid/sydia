import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin_/whatsapp")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/integrations" });
  },
});
