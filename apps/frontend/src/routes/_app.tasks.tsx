import { createFileRoute } from "@tanstack/react-router";
import { TaskPage } from "@/components/tasks/task-page";

export const Route = createFileRoute("/_app/tasks")({
  head: () => ({
    meta: [
      { title: "Tugas · Sydia" },
      {
        name: "description",
        content: "Pantau dan pindahkan tugas melalui papan kerja empat tahap.",
      },
    ],
  }),
  component: TaskPage,
});
