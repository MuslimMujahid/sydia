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

function integer(
  value: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const found = value[key] ?? fallback;
  if (typeof found !== 'number' || !Number.isInteger(found))
    throw new Error(`${key} wajib berupa bilangan bulat.`);

  return found;
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
        name: 'list_documents',
        label: 'Mendaftar file',
        description:
          'Daftar metadata dokumen milik pengguna, termasuk ID, nama file, jenis, ukuran, status pemrosesan, dan waktu dibuat. Tidak mengembalikan isi dokumen.',
        parameters: schema({}),
      },
      parseArguments,
      execute: async ({ userId }) => ({
        documents: (await deps.documents.listMetadata(userId)).map(
          (document) => ({
            id: document.id,
            filename: document.file.originalName,
            mimeType: document.file.mimeType,
            size: document.file.size,
            status: document.status,
            createdAt: document.createdAt,
          }),
        ),
      }),
    },
    {
      definition: {
        name: 'read_document',
        label: 'Membaca dokumen',
        description:
          'Baca potongan isi dari satu dokumen secara berurutan. Menerima ID dokumen, cursor awal, dan jumlah potongan. Mengembalikan metadata dokumen, potongan beserta posisi halaman, cursor berikutnya, dan penanda apakah masih ada isi.',
        parameters: schema(
          {
            documentId: string,
            cursor: { type: 'integer', minimum: 0 },
            limit: { type: 'integer', minimum: 1, maximum: 20 },
          },
          ['documentId'],
        ),
      },
      parseArguments,
      execute: async ({ userId, arguments: raw }) => {
        const a = record(raw);
        const cursor = integer(a, 'cursor', 0);
        const limit = integer(a, 'limit', 8);
        if (cursor < 0 || limit < 1 || limit > 20)
          throw new Error('Rentang pembacaan dokumen tidak valid.');

        const result = await deps.documents.read(
          userId,
          text(a, 'documentId')!,
          cursor,
          limit,
        );

        if (!result) throw new Error('Dokumen tidak ditemukan.');

        return {
          documentId: result.document.id,
          filename: result.document.file.originalName,
          status: result.document.status,
          chunks: result.chunks.map((chunk) => ({
            chunk: chunk.chunkIndex,
            page: chunk.pageNumber,
            content: chunk.content,
          })),
          nextCursor: result.nextCursor,
          hasMore: result.nextCursor !== null,
        };
      },
    },
    {
      definition: {
        name: 'save_attached_files',
        label: 'Menyimpan file lampiran',
        description:
          'Simpan semua file yang dilampirkan pada pesan aktif ke koleksi dokumen pengguna.',
        parameters: schema({}),
      },
      parseArguments,
      execute: async ({ userId, sourceMessageId }) => {
        const documents = await deps.documents.listAttached(
          userId,
          sourceMessageId,
        );

        if (documents.length === 0)
          throw new Error('Tidak ada file yang dilampirkan pada pesan ini.');

        return { objectType: 'documents', objects: documents };
      },
    },
    {
      definition: {
        name: 'search_documents',
        label: 'Mencari dokumen',
        description:
          'Cari potongan dokumen yang relevan dengan kueri semantik. Mengembalikan maksimal 6 hasil berperingkat relevansi dengan identitas dokumen, nama file, posisi halaman atau potongan, dan kutipan. Hasil tidak menjamin cakupan seluruh dokumen.',
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
