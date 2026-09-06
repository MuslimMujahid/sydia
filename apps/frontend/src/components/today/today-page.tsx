import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarCheck2,
  CalendarDays,
  CheckSquare2,
  Clock3,
  MapPin,
  MessageSquareText,
} from "lucide-react";
import { EmptyState } from "@/components/app-states";
import {
  DomainInlineError,
  DomainListSkeleton,
} from "@/components/domain/domain-page";
import { CompactReminderRow } from "@/components/reminders/reminder-page";
import { CompactTaskRow } from "@/components/tasks/task-page";
import { Button } from "@/components/ui/button";
import { calendarEventsQueryOptions } from "@/lib/services/api/calendar/calendar.queries";
import { todayQueryOptions } from "@/lib/services/api/today/today.queries";
import { formatDay, formatDayInZone, formatDateTimeInZone } from "@/lib/utils/date-time";

export function TodayPage({ firstName }: { firstName: string }) {
  const query = useQuery(todayQueryOptions());
  const eventRange = useMemo(() => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);
  const eventsQuery = useQuery(calendarEventsQueryOptions(eventRange));
  const events = (eventsQuery.data ?? []).filter(
    (event) => event.status !== "cancelled"
  );
  const hasOverviewItems = Boolean(
    query.data?.tasks.length || query.data?.reminders.length
  );
  const hasItems = hasOverviewItems || Boolean(events.length);

  return (
    <div className="space-y-10">
      <header className="grid gap-7 border-b border-surface-1 pb-9 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="max-w-3xl">
          <p className="text-sm text-ink-muted">
            {query.data ? formatDay(query.data.date) : "Hari ini"}
          </p>
          <h1 className="mt-2 font-display text-4xl leading-tight font-extrabold sm:text-5xl">
            Selamat datang, {firstName}.
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-ink-muted">
            Lihat apa yang perlu ditindaklanjuti sekarang. Sydia tetap menjadi
            tempat tercepat untuk menangkap hal baru.
          </p>
        </div>
        <Button nativeButton={false} render={<Link to="/chat" />}>
          <MessageSquareText /> Bicara dengan Sydia
        </Button>
      </header>

      {query.isPending ? (
        <DomainListSkeleton label="Memuat ringkasan hari ini" />
      ) : null}
      {query.isError ? (
        <DomainInlineError
          title="Hari ini tidak dapat dimuat"
          message={query.error.message}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.isSuccess && eventsQuery.isSuccess && !hasItems ? (
        <EmptyState
          title="Hari ini masih lapang"
          message="Belum ada tugas jatuh tempo, pengingat terjadwal, atau acara dalam tujuh hari ke depan. Anda dapat menangkap rencana berikutnya melalui chat."
          action={
            <Button nativeButton={false} render={<Link to="/chat" />}>
              <MessageSquareText /> Mulai dari chat
            </Button>
          }
        />
      ) : null}
      {query.isSuccess && (hasItems || eventsQuery.isPending || eventsQuery.isError) ? (
        <div className="grid gap-10 xl:grid-cols-2">
          <section aria-labelledby="today-tasks-title">
            <div className="flex items-center justify-between gap-4 border-b border-surface-1 pb-4">
              <div className="flex items-center gap-3">
                <CheckSquare2 className="size-5 text-brand-deep" />
                <h2
                  id="today-tasks-title"
                  className="font-display text-2xl font-bold"
                >
                  Tugas hari ini
                </h2>
              </div>
              <Button
                variant="link"
                size="sm"
                nativeButton={false}
                render={<Link to="/tasks" />}
              >
                Semua tugas <ArrowRight />
              </Button>
            </div>
            {query.data.tasks.length ? (
              <ul className="divide-y divide-surface-1">
                {query.data.tasks.map((task) => (
                  <CompactTaskRow key={task.id} task={task} />
                ))}
              </ul>
            ) : (
              <p className="py-7 text-ink-muted">
                Tidak ada tugas yang perlu diselesaikan hari ini.
              </p>
            )}
          </section>
          <section aria-labelledby="today-reminders-title">
            <div className="flex items-center justify-between gap-4 border-b border-surface-1 pb-4">
              <div className="flex items-center gap-3">
                <CalendarCheck2 className="size-5 text-brand-deep" />
                <h2
                  id="today-reminders-title"
                  className="font-display text-2xl font-bold"
                >
                  Pengingat hari ini
                </h2>
              </div>
              <Button
                variant="link"
                size="sm"
                nativeButton={false}
                render={<Link to="/reminders" />}
              >
                Semua pengingat <ArrowRight />
              </Button>
            </div>
            {query.data.reminders.length ? (
              <ul className="divide-y divide-surface-1">
                {query.data.reminders.map((reminder) => (
                  <CompactReminderRow key={reminder.id} reminder={reminder} />
                ))}
              </ul>
            ) : (
              <p className="py-7 text-ink-muted">
                Tidak ada pengingat lain yang dijadwalkan hari ini.
              </p>
            )}
          </section>
          <section aria-labelledby="today-calendar-title" className="xl:col-span-2">
            <div className="flex items-center justify-between gap-4 border-b border-surface-1 pb-4">
              <div className="flex items-center gap-3">
                <CalendarDays className="size-5 text-brand-deep" />
                <h2 id="today-calendar-title" className="font-display text-2xl font-bold">
                  Agenda mendatang
                </h2>
              </div>
              <Button variant="link" size="sm" nativeButton={false} render={<Link to="/calendar" />}>
                Buka kalender <ArrowRight />
              </Button>
            </div>
            {eventsQuery.isPending ? (
              <p className="py-7 text-ink-muted" role="status">Memuat agenda…</p>
            ) : null}
            {eventsQuery.isError ? (
              <div className="py-7" role="alert">
                <p className="text-sm text-destructive">{eventsQuery.error.message}</p>
                <Button variant="secondary" size="sm" className="mt-3" onClick={() => void eventsQuery.refetch()}>
                  Coba lagi
                </Button>
              </div>
            ) : null}
            {eventsQuery.isSuccess && events.length ? (
              <ul className="divide-y divide-surface-1">
                {events.slice(0, 4).map((event) => (
                  <li key={event.id} className="grid gap-2 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div>
                      <p className="font-display font-bold">{event.title}</p>
                      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
                        <time dateTime={event.startAt} className="flex items-center gap-1.5">
                          <Clock3 className="size-4" /> {formatDayInZone(event.startAt, event.timezone)} · {formatDateTimeInZone(event.startAt, event.timezone)}
                        </time>
                        {event.location ? <span className="flex items-center gap-1.5"><MapPin className="size-4" /> {event.location}</span> : null}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            {eventsQuery.isSuccess && !events.length ? (
              <p className="py-7 text-ink-muted">Tidak ada acara dalam tujuh hari ke depan.</p>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
