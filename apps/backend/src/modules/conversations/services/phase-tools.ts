import type { JSONSchema7 } from 'ai';
import type { Prisma } from '../../../generated/prisma/client';
import type { CalendarEventWrite } from '../../../database/entities';
import type {
  ICalendarRepository,
  IContactRepository,
  IUserRepository,
} from '../../../database/interfaces';
import { CalendarService } from '../../calendar/calendar.service';
import { DocumentService } from '../../documents/document.service';
import type { AssistantTool } from './tool-executor.service';

const string = { type: 'string' } as const;
const schema = (
  properties: NonNullable<JSONSchema7['properties']>,
  required: string[] = [],
): JSONSchema7 => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Argumen alat tidak valid.');

  return value as Record<string, unknown>;
}

function text(
  value: Record<string, unknown>,
  key: string,
  required = true,
): string | undefined {
  const found = value[key];
  if (found === undefined && !required) return undefined;
  if (typeof found !== 'string' || !found.trim())
    throw new Error(`${key} wajib berupa teks.`);

  return found.trim();
}

function date(
  value: Record<string, unknown>,
  key: string,
  required = true,
): Date | undefined {
  const raw = text(value, key, required);
  if (!raw) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.valueOf()))
    throw new Error(`${key} wajib berupa waktu ISO.`);

  return parsed;
}

export function createPhaseTools(deps: {
  contacts: IContactRepository;
  documents: DocumentService;
  calendars: ICalendarRepository;
  calendarService: CalendarService;
  users: IUserRepository;
}): AssistantTool[] {
  const parseArguments = (value: unknown): Prisma.InputJsonValue =>
    record(value) as Prisma.InputJsonValue;

  return [
    {
      definition: {
        name: 'save_contact',
        label: 'Menyimpan kontak',
        description:
          'Simpan kontak baru beserta alias, email, telepon, atau catatan.',
        parameters: schema(
          {
            name: string,
            aliases: { type: 'array', items: string },
            email: string,
            phone: string,
            notes: string,
          },
          ['name'],
        ),
      },
      parseArguments,
      execute: async ({ userId, arguments: raw }) => {
        const a = record(raw);

        return {
          objectType: 'contact',
          object: await deps.contacts.create(userId, {
            name: text(a, 'name')!,
            aliases: Array.isArray(a.aliases)
              ? a.aliases.filter((v): v is string => typeof v === 'string')
              : [],
            email: text(a, 'email', false) ?? null,
            phone: text(a, 'phone', false) ?? null,
            notes: text(a, 'notes', false) ?? null,
          }),
        };
      },
    },
    {
      definition: {
        name: 'resolve_contact',
        label: 'Mencari kontak',
        description:
          'Temukan kontak secara pasti melalui nama, alias, email, atau nomor telepon.',
        parameters: schema({ reference: string }, ['reference']),
      },
      parseArguments,
      execute: async ({ userId, arguments: raw }) => ({
        contacts: await deps.contacts.resolve(
          userId,
          text(record(raw), 'reference')!,
        ),
      }),
    },
    {
      definition: {
        name: 'search_documents',
        label: 'Mencari dokumen',
        description:
          'Wajib digunakan sebelum menjawab pertanyaan yang bergantung pada file pengguna. Cari isi dokumen pengguna dan kembalikan sumber nama file serta bagian dokumen. File yang dilampirkan pada pesan aktif diprioritaskan sebagai cakupan pencarian.',
        parameters: schema({ query: string }, ['query']),
      },
      parseArguments,
      execute: async ({ userId, sourceMessageId, arguments: raw }) => ({
        sources: (
          await deps.documents.searchForMessage(
            userId,
            sourceMessageId,
            text(record(raw), 'query')!,
            6,
          )
        ).map((chunk) => ({
          documentId: chunk.documentId,
          filename: chunk.title,
          page: chunk.pageNumber,
          chunk: chunk.chunkIndex,
          quote: chunk.content,
        })),
      }),
    },
    {
      definition: {
        name: 'list_calendar_events',
        label: 'Mencari event kalender',
        description: 'Daftar event kalender dalam rentang ISO.',
        parameters: schema({ from: string, to: string }, ['from', 'to']),
      },
      parseArguments,
      execute: async ({ userId, arguments: raw }) => {
        const a = record(raw);

        return {
          events: await deps.calendars.list(
            userId,
            date(a, 'from')!,
            date(a, 'to')!,
          ),
        };
      },
    },
    {
      definition: {
        name: 'create_calendar_event',
        label: 'Membuat event kalender',
        description:
          'Buat event setelah judul, waktu mulai, dan waktu selesai jelas. Konversikan waktu lokal memakai zona waktu profil pengguna dan sertakan offset eksplisit dalam startAt/endAt; contoh 10.00 Asia/Jakarta adalah 10:00:00+07:00, bukan Z.',
        parameters: schema(
          {
            title: string,
            description: string,
            location: string,
            startAt: string,
            endAt: string,
            attendees: { type: 'array', items: string },
          },
          ['title', 'startAt', 'endAt'],
        ),
      },
      parseArguments,
      execute: async ({ userId, arguments: raw }) => {
        const a = record(raw);
        const input: CalendarEventWrite = {
          title: text(a, 'title')!,
          description: text(a, 'description', false) ?? null,
          location: text(a, 'location', false) ?? null,
          startAt: date(a, 'startAt')!,
          endAt: date(a, 'endAt')!,
          timezone:
            (await deps.users.findById(userId))?.timezone ?? 'Asia/Jakarta',
          attendees: Array.isArray(a.attendees)
            ? a.attendees.filter((v): v is string => typeof v === 'string')
            : [],
        };

        if (input.endAt <= input.startAt)
          throw new Error('Waktu selesai harus setelah waktu mulai.');

        return {
          objectType: 'calendar_event',
          object: await deps.calendarService.create(userId, input),
        };
      },
    },
    {
      definition: {
        name: 'update_calendar_event',
        label: 'Memperbarui event kalender',
        description:
          'Perbarui event berdasarkan id. Bila mengubah waktu, sertakan offset zona waktu profil pengguna pada startAt/endAt.',
        parameters: schema(
          {
            id: string,
            title: string,
            description: string,
            location: string,
            startAt: string,
            endAt: string,
          },
          ['id'],
        ),
      },
      parseArguments,
      execute: async ({ userId, arguments: raw }) => {
        const a = record(raw);
        const updated = await deps.calendarService.update(
          userId,
          text(a, 'id')!,
          {
            title: text(a, 'title', false),
            description: text(a, 'description', false),
            location: text(a, 'location', false),
            startAt: date(a, 'startAt', false),
            endAt: date(a, 'endAt', false),
          },
        );

        if (!updated) throw new Error('Event tidak ditemukan.');

        return { objectType: 'calendar_event', object: updated };
      },
    },
    {
      definition: {
        name: 'cancel_calendar_event',
        label: 'Membatalkan event kalender',
        description: 'Batalkan event berdasarkan id.',
        parameters: schema({ id: string }, ['id']),
      },
      parseArguments,
      execute: async ({ userId, arguments: raw }) => {
        const cancelled = await deps.calendarService.cancel(
          userId,
          text(record(raw), 'id')!,
        );

        if (!cancelled) throw new Error('Event tidak ditemukan.');

        return { objectType: 'calendar_event', object: cancelled };
      },
    },
  ];
}
