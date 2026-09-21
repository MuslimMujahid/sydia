import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  DailyNotePage,
  type DailyNotePageProps,
} from "@/components/daily-notes/daily-note-page";
import { dayKeyInZone } from "@/components/calendar/month-grid";

const dayKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() + 1 === month &&
      date.getUTCDate() === day
    );
  });

const dailyNoteSearchSchema = z.object({
  date: dayKeySchema.optional(),
});

export const Route = createFileRoute("/_app/daily-notes")({
  validateSearch: dailyNoteSearchSchema,
  head: () => ({
    meta: [
      { title: "Catatan harian · Sydia" },
      {
        name: "description",
        content:
          "Tulis, simpan, dan telusuri kembali satu catatan untuk setiap hari.",
      },
    ],
  }),
  component: DailyNotesRoute,
});

function DailyNotesRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = Route.useRouteContext();
  const today = dayKeyInZone(new Date(), user.timezone);
  const selectedDate = search.date ?? today;

  const handleDateChange: DailyNotePageProps["onDateChange"] = (date) => {
    void navigate({
      search: { date: date === today ? undefined : date },
    });
  };

  return (
    <DailyNotePage
      selectedDate={selectedDate}
      today={today}
      timezone={user.timezone}
      onDateChange={handleDateChange}
    />
  );
}
