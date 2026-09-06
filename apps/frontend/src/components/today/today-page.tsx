import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarCheck2,
  CheckSquare2,
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
import { todayQueryOptions } from "@/lib/services/api/today/today.queries";
import { formatDay } from "@/lib/utils/date-time";

export function TodayPage({ firstName }: { firstName: string }) {
  const query = useQuery(todayQueryOptions());
  const hasItems = Boolean(
    query.data?.tasks.length || query.data?.reminders.length
  );

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
      {query.isSuccess && !hasItems ? (
        <EmptyState
          title="Hari ini masih lapang"
          message="Belum ada tugas jatuh tempo atau pengingat terjadwal. Anda dapat menangkap rencana berikutnya melalui chat."
          action={
            <Button nativeButton={false} render={<Link to="/chat" />}>
              <MessageSquareText /> Mulai dari chat
            </Button>
          }
        />
      ) : null}
      {query.isSuccess && hasItems ? (
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
        </div>
      ) : null}
    </div>
  );
}
