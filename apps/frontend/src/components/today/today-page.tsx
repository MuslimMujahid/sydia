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
  PauseCircle,
} from "lucide-react";
import { EmptyState } from "@/components/app-states";
import {
  DomainInlineError,
  DomainListSkeleton,
} from "@/components/domain/domain-page";
import { CompactReminderRow } from "@/components/reminders/reminder-page";
import { CompactTaskRow } from "@/components/tasks/task-page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { calendarEventsQueryOptions } from "@/lib/services/api/calendar/calendar.queries";
import { todayQueryOptions } from "@/lib/services/api/today/today.queries";
import { currentUserQueryOptions } from "@/lib/services/api/users/users.queries";
import { userPreferencesQueryOptions } from "@/lib/services/api/users/preferences.queries";
import {
  formatDayInZone,
  formatDateTimeInZone,
  getDayRangeInZone,
} from "@/lib/utils/date-time";

export function TodayPage({ firstName }: { firstName: string }) {
  const query = useQuery(todayQueryOptions());
  const preferencesQuery = useQuery(userPreferencesQueryOptions());
  const profileQuery = useQuery(currentUserQueryOptions());
  const timezone = profileQuery.data?.timezone ?? "UTC";
  const eventRange = useMemo(() => getDayRangeInZone(timezone, 7), [timezone]);

  const eventsQuery = useQuery({
    ...calendarEventsQueryOptions(eventRange),
    enabled: profileQuery.isSuccess,
  });

  const events = (eventsQuery.data ?? []).filter(
    (event) => event.status !== "cancelled"
  );

  const hasOverviewItems = Boolean(
    query.data?.tasks.length || query.data?.reminders.length
  );

  const hasItems = hasOverviewItems || Boolean(events.length);

  return (
    <div className="space-y-10">
      <header className="grid gap-7 border-b border-ink/8 pb-9 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="max-w-3xl">
          <p className="text-sm text-ink-muted">
            {query.data
              ? formatDayInZone(query.data.date, timezone)
              : "Hari ini"}
          </p>
          <h1 className="mt-2 font-display text-[26px] leading-[1.22] font-semibold tracking-[-0.018em]">
            Selamat datang, {firstName}.
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-[1.6] text-ink-muted">
            Lihat apa yang perlu ditindaklanjuti sekarang. Sydia tetap menjadi
            tempat tercepat untuk menangkap hal baru.
          </p>
        </div>
        <Button nativeButton={false} render={<Link to="/chat" />}>
          <MessageSquareText /> Bicara dengan Sydia
        </Button>
      </header>

      {preferencesQuery.isSuccess ? (
        <section
          aria-label="Status briefing dan pesan proaktif"
          className="flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-surface-1 py-4"
        >
          <p className="text-sm text-ink-muted">
            {preferencesQuery.data.briefingEnabled
              ? `Briefing harian aktif, dikirim pukul ${preferencesQuery.data.briefingTime}.`
              : "Briefing harian nonaktif."}{" "}
            <Link
              to="/settings/notifications"
              className="font-semibold text-link underline underline-offset-2"
            >
              Atur notifikasi
            </Link>
          </p>
          {preferencesQuery.data.proactivePaused ? (
            <Badge dot="warn" role="status">
              <PauseCircle className="size-3.5" aria-hidden="true" />
              Pesan proaktif dijeda
            </Badge>
          ) : null}
        </section>
      ) : null}
      {preferencesQuery.isError ? (
        <div
          className="flex flex-wrap items-center gap-3 border-y border-destructive/30 py-4"
          role="alert"
        >
          <p className="text-sm text-destructive">
            {preferencesQuery.error.message}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void preferencesQuery.refetch()}
          >
            Coba lagi
          </Button>
        </div>
      ) : null}

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
      {query.isSuccess &&
      (hasItems || eventsQuery.isPending || eventsQuery.isError) ? (
        <div className="grid gap-10 xl:grid-cols-2">
          <section aria-labelledby="today-tasks-title">
            <div className="flex items-center justify-between gap-4 border-b border-surface-1 pb-4">
              <div className="flex items-center gap-3">
                <CheckSquare2 className="size-5 text-brand-deep" />
                <h2
                  id="today-tasks-title"
                  className="font-display text-[17px] leading-[1.6] font-semibold"
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
                  className="font-display text-[17px] leading-[1.6] font-semibold"
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
          <section
            aria-labelledby="today-calendar-title"
            className="xl:col-span-2"
          >
            <div className="flex items-center justify-between gap-4 border-b border-surface-1 pb-4">
              <div className="flex items-center gap-3">
                <CalendarDays className="size-5 text-brand-deep" />
                <h2
                  id="today-calendar-title"
                  className="font-display text-[17px] leading-[1.6] font-semibold"
                >
                  Agenda mendatang
                </h2>
              </div>
              <Button
                variant="link"
                size="sm"
                nativeButton={false}
                render={<Link to="/calendar" />}
              >
                Buka kalender <ArrowRight />
              </Button>
            </div>
            {eventsQuery.isPending ? (
              <p className="py-7 text-ink-muted" role="status">
                Memuat agenda…
              </p>
            ) : null}
            {eventsQuery.isError ? (
              <div className="py-7" role="alert">
                <p className="text-sm text-destructive">
                  {eventsQuery.error.message}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() => void eventsQuery.refetch()}
                >
                  Coba lagi
                </Button>
              </div>
            ) : null}
            {eventsQuery.isSuccess && events.length ? (
              <ul className="divide-y divide-surface-1">
                {events.slice(0, 4).map((event) => (
                  <li
                    key={event.id}
                    className="grid gap-2 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div>
                      <p className="font-display font-bold">{event.title}</p>
                      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
                        <time
                          dateTime={event.startAt}
                          className="flex items-center gap-1.5"
                        >
                          <Clock3 className="size-4" />{" "}
                          {formatDayInZone(event.startAt, event.timezone)} ·{" "}
                          {formatDateTimeInZone(event.startAt, event.timezone)}
                        </time>
                        {event.location ? (
                          <span className="flex items-center gap-1.5">
                            <MapPin className="size-4" /> {event.location}
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            {eventsQuery.isSuccess && !events.length ? (
              <p className="py-7 text-ink-muted">
                Tidak ada acara dalam tujuh hari ke depan.
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
