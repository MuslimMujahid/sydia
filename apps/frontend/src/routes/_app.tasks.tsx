import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { TaskPage, type TaskPageProps } from "@/components/tasks/task-page";

const taskSearchSchema = z.object({
  id: z.string().trim().min(1).optional(),
});

export const Route = createFileRoute("/_app/tasks")({
  validateSearch: taskSearchSchema,
  head: () => ({
    meta: [
      { title: "Tugas · Sydia" },
      {
        name: "description",
        content: "Pantau dan pindahkan tugas melalui papan kerja empat tahap.",
      },
    ],
  }),
  component: TasksRoute,
});

function TasksRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const handleTaskIdChange: TaskPageProps["onTaskIdChange"] = (id) => {
    void navigate({
      search: { id },
      replace: true,
    });
  };

  return (
    <TaskPage taskId={search.id} onTaskIdChange={handleTaskIdChange} />
  );
}
