import type { BriefingSnapshot } from './briefing-prompt';
import { dayWindow } from '../../shared/date-time';
import {
  notificationDate,
  notificationDay,
  notificationEventRow,
  notificationRow,
  notificationTaskRow,
  type NotificationFormat,
} from './notification-formatting';

// A conservative common text budget keeps the whole briefing in one message.
// Counting raw UTF-16 (including Markdown) also reserves formatting overhead.
export const BRIEFING_MESSAGE_LIMIT = 4096;

type Group = 'overdue' | 'tasks' | 'events' | 'reminders';
type BriefingRow = {
  day: number;
  group: Group;
  text: string;
  at: number;
  priority: number;
};

const PRIORITY = { high: 0, medium: 1, low: 2 } as const;
const GROUPS: Group[] = ['overdue', 'tasks', 'events', 'reminders'];

function rowsForDay(
  format: NotificationFormat,
  snapshot: BriefingSnapshot,
  day: number,
): BriefingRow[] {
  return [
    ...snapshot.overdueTasks.map((task) => ({
      day,
      group: 'overdue' as const,
      text: notificationTaskRow(format, task),
      at: task.dueAt ? new Date(task.dueAt).getTime() : 0,
      priority: PRIORITY[task.priority],
    })),
    ...snapshot.tasksDueToday.map((task) => ({
      day,
      group: 'tasks' as const,
      text: notificationTaskRow(format, task),
      at: task.dueAt ? new Date(task.dueAt).getTime() : Number.MAX_SAFE_INTEGER,
      priority: PRIORITY[task.priority],
    })),
    ...snapshot.events.map((event) => ({
      day,
      group: 'events' as const,
      text: notificationEventRow(format, event),
      at:
        event.kind === 'timed'
          ? new Date(event.startAt).getTime()
          : dayWindow(
              new Date(snapshot.instant),
              snapshot.timezone,
            ).start.getTime(),
      priority: PRIORITY.medium,
    })),
    ...snapshot.remindersToday.map((reminder) => ({
      day,
      group: 'reminders' as const,
      text: notificationRow(format, reminder.title, [
        `${format.locale === 'id' ? 'Pada' : 'At'} ${notificationDate(format, reminder.scheduledAt)}`,
      ]),
      at: new Date(reminder.scheduledAt).getTime(),
      priority: PRIORITY.medium,
    })),
  ];
}

function urgency(left: BriefingRow, right: BriefingRow): number {
  return (
    Number(right.group === 'overdue') - Number(left.group === 'overdue') ||
    left.at - right.at ||
    left.priority - right.priority
  );
}

/** Preserve complete rows; omit least urgent items when the message is full. */
export function renderScheduledBriefing(
  format: NotificationFormat,
  today: BriefingSnapshot,
  upcoming: BriefingSnapshot[] | null,
  introduction: string,
  layout: 'combined' | 'weekly' = 'combined',
): { content: string; omitted: number } {
  const snapshots = [today, ...(upcoming ?? [])];
  const rows = snapshots.flatMap((snapshot, day) =>
    rowsForDay(format, snapshot, day),
  );

  const dayLabels = snapshots.map((snapshot) =>
    notificationDay(format, snapshot.date),
  );

  const hasUpcomingRows = rows.some((row) => row.day > 0);

  const id = format.locale === 'id';
  const heading = (text: string) => (format.rich ? `**${text}**` : text);
  const titles: Record<Group, string> = {
    overdue: id ? 'Tugas lewat tenggat' : 'Overdue tasks',
    tasks: id ? 'Tugas hari ini' : 'Tasks due today',
    events: 'Agenda',
    reminders: id ? 'Pengingat hari ini' : 'Reminders today',
  };

  const render = (selected: Set<BriefingRow>): string => {
    const visibleRows = [...selected];
    const parts: string[] = [introduction];

    if (upcoming) {
      parts.unshift(
        heading(
          `${id ? 'Briefing mingguan' : 'Weekly briefing'} · ${dayLabels[0]}–${dayLabels[dayLabels.length - 1]}`,
        ),
      );
      if (layout === 'combined') parts.push(heading(id ? 'Hari ini' : 'Today'));
    }

    for (let day = 0; day < snapshots.length; day += 1) {
      if (day === 1 && layout === 'combined') {
        if (format.rich) parts.push('---');
        parts.push(heading(id ? 'Enam hari ke depan' : 'Coming six days'));
      }

      const dayRows = visibleRows.filter((row) => row.day === day);

      if ((day > 0 || layout === 'weekly') && dayRows.length === 0) continue;
      if (day > 0 || layout === 'weekly') parts.push(heading(dayLabels[day]!));

      for (const group of GROUPS) {
        const items = dayRows.filter((row) => row.group === group);
        if (items.length === 0) continue;
        const title =
          (day > 0 || layout === 'weekly') && group === 'tasks'
            ? id
              ? 'Tugas'
              : 'Tasks'
            : (day > 0 || layout === 'weekly') && group === 'reminders'
              ? id
                ? 'Pengingat'
                : 'Reminders'
              : titles[group];

        parts.push(
          `${heading(`${title} (${items.length})`)}\n\n${items.map((row) => row.text).join('\n')}`,
        );
      }

      if (
        upcoming &&
        layout === 'combined' &&
        day === 0 &&
        dayRows.length === 0
      ) {
        parts.push(
          id
            ? 'Tidak ada item yang ditampilkan untuk hari ini.'
            : 'No items shown for today.',
        );
      }
    }

    if (upcoming && layout === 'combined' && !hasUpcomingRows) {
      parts.push(
        id
          ? 'Belum ada tugas, agenda, atau pengingat untuk enam hari ke depan.'
          : 'No tasks, events, or reminders in the coming six days.',
      );
    }

    if (layout === 'weekly' && rows.length === 0) {
      parts.push(
        id
          ? 'Belum ada tugas, agenda, atau pengingat untuk tujuh hari ke depan.'
          : 'No tasks, events, or reminders in the coming seven days.',
      );
    }

    const omitted = rows.length - selected.size;
    if (omitted > 0)
      parts.push(
        id
          ? `${omitted} item lainnya tidak ditampilkan agar briefing tetap dalam satu pesan.`
          : `${omitted} more ${omitted === 1 ? 'item' : 'items'} omitted to keep this briefing in one message.`,
      );

    const sections = parts.filter(Boolean);

    if (format.rich && upcoming) {
      // Telegram can collapse adjacent paragraphs. Keep a blank line between
      // the weekly title, introduction, and first section using hard breaks.
      const opening = sections.splice(0, 3).join('\\\n\\\n');
      sections.unshift(opening);
    }

    return sections.join('\n\n');
  };

  const all = new Set(rows);
  const full = render(all);
  if (full.length <= BRIEFING_MESSAGE_LIMIT)
    return { content: full, omitted: 0 };

  const selected = new Set<BriefingRow>();

  // The empty rendering includes the largest possible omitted count, so it
  // reserves space even when no complete item can fit (e.g. a huge title).
  if (render(selected).length > BRIEFING_MESSAGE_LIMIT) {
    throw new Error(
      'Briefing introduction and headings exceed the single-message budget.',
    );
  }

  for (const row of [...rows].sort(urgency)) {
    selected.add(row);
    if (render(selected).length > BRIEFING_MESSAGE_LIMIT) selected.delete(row);
  }

  return { content: render(selected), omitted: rows.length - selected.size };
}
