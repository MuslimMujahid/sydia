import { createFileRoute } from "@tanstack/react-router";
import { AssistantSettingsPage } from "@/components/settings/assistant-page";

export const Route = createFileRoute("/_app/settings/assistant")({
  head: () => ({
    meta: [
      { title: "Asisten · Sydia" },
      {
        name: "description",
        content: "Atur persona asisten Sydia.",
      },
    ],
  }),
  component: AssistantSettingsPage,
});
