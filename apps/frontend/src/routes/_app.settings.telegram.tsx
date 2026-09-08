import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/telegram")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/integrations" });
  },
});
