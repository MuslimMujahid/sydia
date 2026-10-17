import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { NotesWorkspacePage } from "@/components/notes/notes-workspace-page";
import { isNoteRef } from "@/components/notes/navigation-state";
import { dayKeyInZone } from "@/components/calendar/month-anchor";

export const Route = createFileRoute("/_app/notes")({
  validateSearch: z.object({
    note: z
      .string()
      .regex(/^[a-zA-Z0-9_-]+$/)
      .optional(),
    date: z
      .string()
      .refine((value) => isNoteRef(`daily:${value}`))
      .optional(),
  }),
  head: () => ({
    meta: [
      { title: "Catatan · Sydia" },
      {
        name: "description",
        content:
          "Tulis dan hubungkan catatan harian serta catatan dalam folder.",
      },
    ],
  }),
  component: NotesRoute,
});

function NotesRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = Route.useRouteContext();

  return (
    <NotesWorkspacePage
      userId={user.id}
      today={dayKeyInZone(new Date(), user.timezone)}
      selectedRef={
        search.note
          ? `custom:${search.note}`
          : search.date
            ? `daily:${search.date}`
            : undefined
      }
      onNavigate={async (ref) => {
        await navigate({
          search: ref.startsWith("daily:")
            ? { date: ref.slice(6) }
            : { note: ref.slice(7) },
        });
      }}
    />
  );
}
