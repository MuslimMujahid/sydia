import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarDays, CheckSquare2, Clock3 } from "lucide-react";
import { calendarEventsQueryOptions } from "@/lib/services/api/calendar/calendar.queries";
import { todayQueryOptions } from "@/lib/services/api/today/today.queries";
import { currentUserQueryOptions } from "@/lib/services/api/users/users.queries";
import { formatDateTimeInZone, getDayRangeInZone } from "@/lib/utils/date-time";

function AgendaSkeleton() {
  return (
    <div
      className="mx-auto mt-7 w-full max-w-2xl space-y-2"
      aria-label="Memuat agenda hari ini"
      aria-busy="true"
    >
      {["first", "second"].map((key) => (
        <div
          key={key}
          className="h-9 animate-pulse rounded-sm bg-surface-1 motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}

export function TodayAgenda() {
  const todayQuery = useQuery(todayQueryOptions());
  const profileQuery = useQuery(currentUserQueryOptions());
  const timezone = profileQuery.data?.timezone ?? "UTC";
  const range = useMemo(() => getDayRangeInZone(timezone, 1), [timezone]);
  const eventsQuery = useQuery({
    ...calendarEventsQueryOptions(range),
    enabled: profileQuery.isSuccess,
  });

  const tasks = todayQuery.data?.tasks.slice(0, 3) ?? [];
  const events =
    eventsQuery.data
      ?.filter((event) => event.status !== "cancelled")
      .slice(0, 3) ?? [];

  if (todayQuery.isPending || profileQuery.isPending || eventsQuery.isPending) {
    return <AgendaSkeleton />;
  }

  if (!tasks.length && !events.length) return null;

  return (
    <section
      aria-labelledby="today-agenda-title"
      className="mx-auto mt-7 w-full max-w-2xl border-t border-ink/8 pt-4 text-left"
    >
      <div className="flex items-center justify-between gap-4 px-2">
        <h2
          id="today-agenda-title"
          className="text-xs font-semibold text-ink-muted"
        >
          Hari ini
        </h2>
        <div className="flex gap-4 text-xs font-semibold">
          {tasks.length ? (
            <Link to="/tasks" className="text-ink-muted hover:text-ink">
              Semua tugas
            </Link>
          ) : null}
          {events.length ? (
            <Link to="/calendar" className="text-ink-muted hover:text-ink">
              Kalender
            </Link>
          ) : null}
        </div>
      </div>
      <ul className="mt-2 divide-y divide-ink/8">
        {tasks.map((task) => (
          <li key={task.id}>
            <Link
              to="/tasks"
              className="flex min-h-10 items-center gap-3 rounded-sm px-2 py-2 outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-brand/50"
            >
              <CheckSquare2
                className="size-4 shrink-0 text-ink-muted"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-sm">
                {task.title}
              </span>
              {task.dueAt ? (
                <time
                  dateTime={task.dueAt}
                  className="shrink-0 text-xs text-ink-muted"
                >
                  {formatDateTimeInZone(task.dueAt, timezone)}
                </time>
              ) : null}
            </Link>
          </li>
        ))}
        {events.map((event) => (
          <li key={event.id}>
            <Link
              to="/calendar"
              className="flex min-h-10 items-center gap-3 rounded-sm px-2 py-2 outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-brand/50"
            >
              <CalendarDays
                className="size-4 shrink-0 text-ink-muted"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-sm">
                {event.title}
              </span>
              <time
                dateTime={event.startAt}
                className="flex shrink-0 items-center gap-1 text-xs text-ink-muted"
              >
                <Clock3 className="size-3.5" aria-hidden="true" />
                {formatDateTimeInZone(event.startAt, event.timezone)}
              </time>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
