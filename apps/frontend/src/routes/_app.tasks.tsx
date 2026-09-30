import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

const taskSearchSchema = z.object({
  id: z.string().trim().min(1).optional(),
});

/**
 * Tasks now live in the merged calendar page. This route keeps old links and
 * bookmarks working by sending them to its task view.
 */
export const Route = createFileRoute("/_app/tasks")({
  validateSearch: taskSearchSchema,
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/calendar",
      search: { mode: "tasks", id: search.id },
      replace: true,
    });
  },
});
