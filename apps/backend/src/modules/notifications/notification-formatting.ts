import type { SupportedLocale, TaskPriority } from '../../database/entities';
import type { BriefingSnapshot } from './briefing-prompt';

export type NotificationBodies = { telegram: string; whatsapp: string };
export type NotificationFormat = {
  locale: SupportedLocale;
  timezone: string;
  rich: boolean;
};

/** Preserve literal names while adding Markdown only on rich channels. */
function literal(value: string, rich: boolean): string {
  const text = value
    .replace(/[\p{Cc}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return rich ? text.replace(/([\\`*_[\]<>!#|~$=^])/g, '\\$1') : text;
}

export function notificationRow(
  format: NotificationFormat,
  title: string,
  details: readonly string[],
): string {
  const text = literal(title, format.rich);
  const subject = format.rich ? `**${text}**` : text;

  return `- ${subject}${details.length ? ` — ${details.map((detail) => literal(detail, format.rich)).join(' · ')}` : ''}`;
}

export function notificationDate(
  format: NotificationFormat,
  value: string | Date,
): string {
  return new Intl.DateTimeFormat(format.locale === 'id' ? 'id-ID' : 'en-GB', {
    timeZone: format.timezone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
}

export function notificationDay(
  format: NotificationFormat,
  value: string,
): string {
  return new Intl.DateTimeFormat(format.locale === 'id' ? 'id-ID' : 'en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00.000Z`));
}

export function notificationTaskRow(
  format: NotificationFormat,
  task: { title: string; dueAt: string | Date | null; priority: TaskPriority },
): string {
  const details: string[] = [];
  if (task.dueAt)
    details.push(
      `${format.locale === 'id' ? 'Tenggat' : 'Due'} ${notificationDate(format, task.dueAt)}`,
    );

  if (task.priority !== 'medium') {
    const priority =
      format.locale === 'id'
        ? { low: 'rendah', high: 'tinggi' }[task.priority]
        : task.priority;

    details.push(
      `${format.locale === 'id' ? 'Prioritas' : 'Priority'} ${priority}`,
    );
  }

  return notificationRow(format, task.title, details);
}

export function notificationEventRow(
  format: NotificationFormat,
  event: BriefingSnapshot['events'][number],
): string {
  if (event.kind === 'all_day') {
    const lastDate = new Date(`${event.endDate}T12:00:00.000Z`);
    lastDate.setUTCDate(lastDate.getUTCDate() - 1);
    const lastDateKey = lastDate.toISOString().slice(0, 10);
    const range =
      event.startDate === lastDateKey
        ? notificationDay(format, event.startDate)
        : `${notificationDay(format, event.startDate)}–${notificationDay(format, lastDateKey)}`;

    return notificationRow(format, event.title, [range]);
  }

  const day = new Intl.DateTimeFormat('en-CA', { timeZone: format.timezone });
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  const until =
    day.format(start) === day.format(end)
      ? new Intl.DateTimeFormat(format.locale === 'id' ? 'id-ID' : 'en-GB', {
          timeZone: format.timezone,
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).format(end)
      : notificationDate(format, end);

  return notificationRow(format, event.title, [
    `${notificationDate(format, start)}–${until}`,
  ]);
}

export function renderBriefingBody(
  format: NotificationFormat,
  snapshot: BriefingSnapshot,
  introduction: string,
): string {
  const sections: string[] = [introduction];

  const section = (en: string, id: string, rows: string[]) => {
    if (rows.length === 0) return;
    const title = `${format.locale === 'id' ? id : en} (${rows.length})`;
    sections.push(
      `${format.rich ? `**${title}**` : title}\n\n${rows.join('\n')}`,
    );
  };

  section(
    'Overdue tasks',
    'Tugas lewat tenggat',
    snapshot.overdueTasks.map((task) => notificationTaskRow(format, task)),
  );
  section(
    'Tasks due today',
    'Tugas hari ini',
    snapshot.tasksDueToday.map((task) => notificationTaskRow(format, task)),
  );
  section(
    'Agenda',
    'Agenda',
    snapshot.events.map((event) => notificationEventRow(format, event)),
  );
  section(
    'Reminders today',
    'Pengingat hari ini',
    snapshot.remindersToday.map((reminder) =>
      notificationRow(format, reminder.title, [
        `${format.locale === 'id' ? 'Pada' : 'At'} ${notificationDate(format, reminder.scheduledAt)}`,
      ]),
    ),
  );

  return sections.join('\n\n');
}
