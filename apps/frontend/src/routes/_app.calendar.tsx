import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  CalendarPage,
  type CalendarPageProps,
} from "@/components/calendar/calendar-page";
import { CALENDAR_VIEWS, isDayKey } from "@/components/calendar/calendar-date";
import { CalendarModeSwitch } from "@/components/calendar/calendar-mode-switch";
import { TaskPage, type TaskPageProps } from "@/components/tasks/task-page";

/** The calendar opens on the day; other views are kept in the URL. */
const DEFAULT_VIEW = "day";

const calendarSearchSchema = z.object({
  /** `tasks` shows the task manager; the calendar is the default. */
  mode: z.enum(["tasks"]).optional(),
  view: z.enum(CALENDAR_VIEWS).optional(),
  date: z.string().refine(isDayKey).optional(),
  /** The task open in the task editor. */
  id: z.string().trim().min(1).optional(),
});

export const Route = createFileRoute("/_app/calendar")({
  validateSearch: calendarSearchSchema,
  head: () => ({
    meta: [
      { title: "Kalender · Sydia" },
      {
        name: "description",
        content:
          "Lihat acara dan tugas bertenggat dalam satu kalender, lalu kelola tugas di Sydia.",
      },
    ],
  }),
  component: CalendarRoute,
});

function CalendarRoute() {
  const user = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const handleTaskIdChange: TaskPageProps["onTaskIdChange"] = (id) => {
    void navigate({
      search: (previous) => ({ ...previous, id }),
      replace: true,
    });
  };

  if (search.mode === "tasks")
    return (
      <TaskPage
        taskId={search.id}
        onTaskIdChange={handleTaskIdChange}
        modeSwitch={<CalendarModeSwitch mode="tasks" />}
      />
    );

  const handleNavigate: CalendarPageProps["onNavigate"] = ({ view, date }) => {
    void navigate({
      search: (previous) => ({
        ...previous,
        view: view === DEFAULT_VIEW ? undefined : view,
        date,
      }),
    });
  };

  return (
    <CalendarPage
      timezone={user.timezone}
      view={search.view ?? DEFAULT_VIEW}
      date={search.date}
      taskId={search.id}
      modeSwitch={<CalendarModeSwitch mode="calendar" />}
      onNavigate={handleNavigate}
      onTaskIdChange={handleTaskIdChange}
    />
  );
}
