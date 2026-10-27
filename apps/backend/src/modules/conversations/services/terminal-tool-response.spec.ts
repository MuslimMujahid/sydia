import { describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jsonSchema, simulateReadableStream, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { OpenRouterLanguageModel } from '../../../infra/model-gateway';
import type { MessageProvider } from '../../../shared/messaging';
import type { AssistantToolDefinition } from './tool-executor.service';
import {
  TERMINAL_TOOL_NAMES,
  buildTerminalToolResponse,
  terminalToolInputSchema,
  type TerminalToolExecution,
} from './terminal-tool-response';

const AT = new Date('2026-09-22T10:00:00.000Z');
const LATER = new Date('2026-09-23T10:00:00.000Z');

describe('memory tools continue the conversation', () => {
  it.each(['save_memory', 'update_memory', 'forget_memory'])(
    'lets the model answer after %s in every receipt state and channel',
    (toolName) => {
      for (const status of ['queued', 'completed', 'withdrawn']) {
        const receipt = { engine: 'hindsight', status };
        const result = { memory: receipt, deleted: true, receipt };
        expect(web('en', [execution(toolName, result)])).toBeNull();
        expect(web('id', [execution(toolName, result)])).toBeNull();
        expect(chat('en', [execution(toolName, result)])).toBeNull();
        expect(
          chat('id', [execution(toolName, result)], 'telegram'),
        ).toBeNull();
      }

      expect(
        web('en', [
          execution(toolName, {
            memory: { content: 'A preference' },
            deleted: true,
          }),
        ]),
      ).toBeNull();
      expect(TERMINAL_TOOL_NAMES.has(toolName)).toBe(false);
      const definition: AssistantToolDefinition = {
        name: toolName,
        label: toolName,
        description: 'Change a memory.',
        parameters: { type: 'object', properties: {} },
      };

      expect(terminalToolInputSchema(definition)).toBe(definition.parameters);
    },
  );

  it.each(['save_memory', 'update_memory', 'forget_memory'])(
    'streams the model reply after %s instead of a storage receipt',
    async (toolName) => {
      const reply = 'Baik, aku pahami preferensimu.';
      const receipt = { engine: 'hindsight', status: 'queued' };
      const execute = jest.fn(() =>
        Promise.resolve(
          JSON.stringify({ memory: receipt, deleted: true, receipt }),
        ),
      );

      const usage = {
        inputTokens: {
          total: 3,
          noCache: 3,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 4, text: 4, reasoning: undefined },
      };

      let steps = 0;
      const languageModel = new MockLanguageModelV4({
        doStream: () => {
          steps += 1;
          const finishReason = steps === 1 ? 'tool-calls' : 'stop';

          return Promise.resolve({
            stream: simulateReadableStream({
              chunks:
                steps === 1
                  ? [
                      { type: 'text-start' as const, id: 'plan' },
                      {
                        type: 'text-delta' as const,
                        id: 'plan',
                        delta: 'Memory save queued',
                      },
                      { type: 'text-end' as const, id: 'plan' },
                      {
                        type: 'tool-call' as const,
                        toolCallId: 'memory-1',
                        toolName,
                        input: '{}',
                      },
                      {
                        type: 'finish' as const,
                        finishReason: {
                          unified: finishReason,
                          raw: undefined,
                        },
                        usage,
                      },
                    ]
                  : [
                      { type: 'text-start' as const, id: 'reply' },
                      {
                        type: 'text-delta' as const,
                        id: 'reply',
                        delta: reply,
                      },
                      { type: 'text-end' as const, id: 'reply' },
                      {
                        type: 'finish' as const,
                        finishReason: {
                          unified: finishReason,
                          raw: undefined,
                        },
                        usage,
                      },
                    ],
            }),
          });
        },
      });

      const gateway = new OpenRouterLanguageModel(
        new ConfigService({ BACKEND_MODEL_API_KEY: 'test-key' }),
      );

      Object.defineProperty(gateway, 'languageModel', { value: languageModel });
      const onTextDelta = jest.fn<(delta: string) => void>();
      const result = await gateway.generate({
        messages: [{ role: 'user', content: 'A personal preference.' }],
        tools: {
          [toolName]: tool({
            inputSchema: jsonSchema({ type: 'object', properties: {} }),
            execute,
          }),
        },
        onTextDelta,
        acknowledgeTerminalStep: (executions, decidedBy) =>
          buildTerminalToolResponse({ locale: 'id' }, executions, decidedBy),
      });

      expect(result.text).toBe(reply);
      expect(languageModel.doStreamCalls).toHaveLength(2);
      expect(execute).toHaveBeenCalledTimes(1);
      expect(onTextDelta.mock.calls).toEqual([[reply]]);
    },
  );

  it('continues when a memory mutation accompanies a terminal action', () => {
    const save = execution('save_memory', {
      memory: { engine: 'hindsight', status: 'queued' },
    });

    const task = execution('create_task', {
      objectType: 'task',
      object: { title: 'Plan dinner', dueAt: null },
    });

    expect(web('en', [task, save])).toBeNull();
    expect(
      buildTerminalToolResponse({ locale: 'en' }, [save, task], [task]),
    ).toBeNull();
  });
});

function execution(
  toolName: string,
  result: unknown,
  args: unknown = {},
): TerminalToolExecution {
  return { toolCallId: `call-${toolName}`, toolName, arguments: args, result };
}

/** The web chat, which renders markdown and smart entity pills. */
function web(
  locale: 'en' | 'id',
  executions: readonly TerminalToolExecution[],
) {
  return buildTerminalToolResponse({ locale }, executions);
}

/** A native channel, which shows no web entity cards. */
function chat(
  locale: 'en' | 'id',
  executions: readonly TerminalToolExecution[],
  channel: MessageProvider = 'whatsapp',
) {
  return buildTerminalToolResponse({ locale, channel }, executions);
}

/**
 * WhatsApp snapshots preserve the plain acknowledgement layouts. Telegram
 * and web snapshots exercise Markdown formatting separately.
 */
const PLAIN_BLOCKS: Array<[string, unknown, string, string]> = [
  [
    'create_task',
    { objectType: 'task', object: { title: 'Kirim laporan', dueAt: null } },
    'All set, your task has been created.\n\n- Kirim laporan',
    'Siap, tugasnya sudah dibuat.\n\n- Kirim laporan',
  ],
  [
    'update_task',
    { objectType: 'task', object: { title: 'Kirim laporan', dueAt: AT } },
    'All set, your task has been updated.\n\n- Kirim laporan — Due 22 Sept 2026, 10:00 UTC',
    'Siap, tugasnya sudah diperbarui.\n\n- Kirim laporan — Tenggat 22 Sep 2026, 10.00 UTC',
  ],
  [
    'update_category',
    { objectType: 'category', object: { name: 'Kerja' } },
    '✏️ Category updated\n\nKerja',
    '✏️ Kategori diperbarui\n\nKerja',
  ],
  [
    'delete_category',
    { objectType: 'category', object: { name: 'Kerja' } },
    '🗑️ Category deleted\n\nKerja',
    '🗑️ Kategori dihapus\n\nKerja',
  ],
  [
    'create_reminder',
    {
      reminders: [
        {
          title: 'Minum obat',
          scheduledAt: AT,
          timezone: 'Asia/Jakarta',
          recurrence: null,
        },
      ],
    },
    'All set, your reminder has been created.\n\n- Minum obat — At 22 Sept 2026, 17:00',
    'Siap, pengingatnya sudah dibuat.\n\n- Minum obat — Pada 22 Sep 2026, 17.00',
  ],
  [
    'update_reminder',
    {
      objectType: 'reminder',
      object: {
        title: 'Minum obat',
        scheduledAt: AT,
        timezone: 'Asia/Jakarta',
        recurrence: { frequency: 'weekly', interval: 1, daysOfWeek: [2, 4] },
      },
    },
    'All set, your reminder has been updated.\n\n- Minum obat — At 22 Sept 2026, 17:00 · weekly on Tuesday, Thursday',
    'Siap, pengingatnya sudah diperbarui.\n\n- Minum obat — Pada 22 Sep 2026, 17.00 · mingguan pada Selasa, Kamis',
  ],
  [
    'store_secret',
    { objectType: 'secret', object: { id: 'secret-1', label: 'ATM' } },
    '🔐 Secret stored\n\nATM',
    '🔐 Rahasia disimpan\n\nATM',
  ],
  [
    'create_secret_reveal_link',
    {
      objectType: 'secret_reveal',
      object: {
        id: 'secret-1',
        label: 'ATM',
        url: 'https://sydia.test/secret-reveal#token',
        expiresAt: AT,
      },
    },
    '🔗 Reveal link created\n\nATM\n🔗 https://sydia.test/secret-reveal#token\n🗓️ 2026-09-22 10:00 UTC',
    '🔗 Tautan dibuat\n\nATM\n🔗 https://sydia.test/secret-reveal#token\n🗓️ 2026-09-22 10:00 UTC',
  ],
  [
    'save_contact',
    {
      objectType: 'contact',
      object: {
        name: 'Bu Rina',
        email: 'rina@example.test',
        phone: '+62 811 000',
        groups: [{ name: 'Teman Kerja' }],
      },
    },
    'All set, your contact has been saved.\n\n- Bu Rina — rina@example.test · +62 811 000 · Groups: Teman Kerja',
    'Siap, kontaknya sudah disimpan.\n\n- Bu Rina — rina@example.test · +62 811 000 · Grup: Teman Kerja',
  ],
  [
    'update_contact_group',
    { objectType: 'contact_group', object: { name: 'Teman Kerja' } },
    'All set, your contact group has been updated.\n\n- Teman Kerja',
    'Siap, grup kontaknya sudah diperbarui.\n\n- Teman Kerja',
  ],
  [
    'delete_contact_group',
    { objectType: 'contact_group', object: { name: 'Teman Kerja' } },
    'All set, your contact group has been deleted.\n\n- Teman Kerja',
    'Siap, grup kontaknya sudah dihapus.\n\n- Teman Kerja',
  ],
  [
    'assign_contact_groups',
    {
      objectType: 'contact',
      object: { name: 'Bu Rina', groups: [{ name: 'Teman Kerja' }] },
    },
    'All set, your contact has been updated.\n\n- Bu Rina — Groups: Teman Kerja',
    'Siap, kontaknya sudah diperbarui.\n\n- Bu Rina — Grup: Teman Kerja',
  ],
  [
    'save_attached_files',
    {
      objectType: 'documents',
      objects: [{ filename: 'notulen.pdf' }, { filename: 'anggaran.pdf' }],
    },
    'All set, 2 files have been saved.\n\n- notulen.pdf\n- anggaran.pdf',
    'Siap, 2 file sudah disimpan.\n\n- notulen.pdf\n- anggaran.pdf',
  ],
  [
    'send_file',
    {
      objectType: 'file',
      object: {
        documentId: 'document-1',
        filename: 'notulen.pdf',
        url: 'https://sydia.test/documents/document-1/content',
        markdownLink:
          '[notulen.pdf](https://sydia.test/documents/document-1/content)',
      },
    },
    'All set, your file has been sent.\n\n- notulen.pdf — https://sydia.test/documents/document-1/content',
    'Siap, filenya sudah dikirim.\n\n- notulen.pdf — https://sydia.test/documents/document-1/content',
  ],
  [
    'send_file',
    {
      objectType: 'file',
      object: {
        documentId: 'document-1',
        filename: 'notulen.pdf',
        providerMessageId: 'wamid-1',
      },
    },
    'All set, your file has been sent.\n\n- notulen.pdf — Sent as an attachment',
    'Siap, filenya sudah dikirim.\n\n- notulen.pdf — Terkirim sebagai lampiran',
  ],
  [
    'create_calendar_event',
    {
      objectType: 'calendar_event',
      object: {
        title: 'Rapat',
        startAt: new Date('2026-09-22T02:00:00.000Z'),
        endAt: new Date('2026-09-22T03:30:00.000Z'),
        timezone: 'Asia/Jakarta',
        location: 'Ruang rapat 2',
        syncState: 'pending',
      },
    },
    'All set, your event is saved in Sydia.\n\n- Rapat — 22 Sept 2026, 09:00–10:30 · Ruang rapat 2 · Google Calendar sync is pending.',
    'Siap, acara sudah disimpan di Sydia.\n\n- Rapat — 22 Sep 2026, 09.00–10.30 · Ruang rapat 2 · Sinkronisasi Google Calendar masih menunggu.',
  ],
  [
    'update_calendar_event',
    {
      objectType: 'calendar_event',
      object: {
        title: 'Rapat',
        startAt: new Date('2026-09-22T02:00:00.000Z'),
        endAt: new Date('2026-09-23T03:00:00.000Z'),
        timezone: 'Asia/Jakarta',
        syncState: 'synced',
      },
    },
    'All set, your event changes are saved in Sydia.\n\n- Rapat — 22 Sept 2026, 09:00–23 Sept 2026, 10:00 · The latest change is synced with Google Calendar.',
    'Siap, perubahan acara sudah disimpan di Sydia.\n\n- Rapat — 22 Sep 2026, 09.00–23 Sep 2026, 10.00 · Perubahan terakhir sudah disinkronkan ke Google Calendar.',
  ],
  [
    'cancel_calendar_event',
    {
      objectType: 'calendar_event',
      object: { title: 'Rapat', status: 'cancelled', syncState: 'pending' },
    },
    'All set, the event was cancelled in Sydia.\n\n- Rapat — Google Calendar sync is pending.',
    'Siap, acara sudah dibatalkan di Sydia.\n\n- Rapat — Sinkronisasi Google Calendar masih menunggu.',
  ],
  [
    'write_daily_note',
    { date: '2026-09-22', written: '## Kerja\n- kirim laporan', noteId: 'n1' },
    '📝 Daily note written\n\n2026-09-22',
    '📝 Catatan harian ditulis\n\n2026-09-22',
  ],
  [
    'delete_reminder',
    { deleted: true, reminderId: 'r1', title: 'Minum obat' },
    'All set, your reminder has been deleted.\n\n- Minum obat',
    'Siap, pengingatnya sudah dihapus.\n\n- Minum obat',
  ],
  [
    'create_contact_group',
    {
      objectType: 'contact_group',
      object: { id: 'g1', name: 'Teman Kerja', contactCount: 2 },
    },
    'All set, your contact group is ready.\n\n- Teman Kerja — 2 contacts',
    'Siap, grup kontaknya sudah tersedia.\n\n- Teman Kerja — 2 kontak',
  ],
];

/**
 * Web snapshots retain entity titles in bold, while metadata stays inline.
 * Categories, secrets, and notes retain their existing block layout.
 */
const RICH_BLOCKS: Array<[string, unknown, string, string]> = [
  [
    'create_task',
    PLAIN_BLOCKS[0]![1],
    'All set, your task has been created.\n\n- **Kirim laporan**',
    'Siap, tugasnya sudah dibuat.\n\n- **Kirim laporan**',
  ],
  [
    'update_task',
    PLAIN_BLOCKS[1]![1],
    'All set, your task has been updated.\n\n- **Kirim laporan** — Due 22 Sept 2026, 10:00 UTC',
    'Siap, tugasnya sudah diperbarui.\n\n- **Kirim laporan** — Tenggat 22 Sep 2026, 10.00 UTC',
  ],
  [
    'update_category',
    PLAIN_BLOCKS[2]![1],
    '✏️ **Category updated**\n\n**Kerja**',
    '✏️ **Kategori diperbarui**\n\n**Kerja**',
  ],
  [
    'delete_category',
    PLAIN_BLOCKS[3]![1],
    '🗑️ **Category deleted**\n\n**Kerja**',
    '🗑️ **Kategori dihapus**\n\n**Kerja**',
  ],
  [
    'create_reminder',
    PLAIN_BLOCKS[4]![1],
    'All set, your reminder has been created.\n\n- **Minum obat** — At 22 Sept 2026, 17:00',
    'Siap, pengingatnya sudah dibuat.\n\n- **Minum obat** — Pada 22 Sep 2026, 17.00',
  ],
  [
    'update_reminder',
    PLAIN_BLOCKS[5]![1],
    'All set, your reminder has been updated.\n\n- **Minum obat** — At 22 Sept 2026, 17:00 · weekly on Tuesday, Thursday',
    'Siap, pengingatnya sudah diperbarui.\n\n- **Minum obat** — Pada 22 Sep 2026, 17.00 · mingguan pada Selasa, Kamis',
  ],
  [
    'store_secret',
    PLAIN_BLOCKS[6]![1],
    '🔐 **Secret stored**\n\n**ATM**',
    '🔐 **Rahasia disimpan**\n\n**ATM**',
  ],
  [
    'create_secret_reveal_link',
    PLAIN_BLOCKS[7]![1],
    '🔗 **Reveal link created**\n\n**ATM**\n🔗 https://sydia.test/secret-reveal#token\n🗓️ 2026-09-22 10:00 UTC',
    '🔗 **Tautan dibuat**\n\n**ATM**\n🔗 https://sydia.test/secret-reveal#token\n🗓️ 2026-09-22 10:00 UTC',
  ],
  [
    'save_contact',
    PLAIN_BLOCKS[8]![1],
    'All set, your contact has been saved.\n\n- **Bu Rina** — rina@example.test · +62 811 000 · Groups: Teman Kerja',
    'Siap, kontaknya sudah disimpan.\n\n- **Bu Rina** — rina@example.test · +62 811 000 · Grup: Teman Kerja',
  ],
  [
    'update_contact_group',
    PLAIN_BLOCKS[9]![1],
    'All set, your contact group has been updated.\n\n- **Teman Kerja**',
    'Siap, grup kontaknya sudah diperbarui.\n\n- **Teman Kerja**',
  ],
  [
    'delete_contact_group',
    PLAIN_BLOCKS[10]![1],
    'All set, your contact group has been deleted.\n\n- **Teman Kerja**',
    'Siap, grup kontaknya sudah dihapus.\n\n- **Teman Kerja**',
  ],
  [
    'assign_contact_groups',
    PLAIN_BLOCKS[11]![1],
    'All set, your contact has been updated.\n\n- **Bu Rina** — Groups: Teman Kerja',
    'Siap, kontaknya sudah diperbarui.\n\n- **Bu Rina** — Grup: Teman Kerja',
  ],
  [
    'save_attached_files',
    PLAIN_BLOCKS[12]![1],
    'All set, 2 files have been saved.\n\n- **notulen.pdf**\n- **anggaran.pdf**',
    'Siap, 2 file sudah disimpan.\n\n- **notulen.pdf**\n- **anggaran.pdf**',
  ],
  [
    'send_file',
    PLAIN_BLOCKS[13]![1],
    'All set, your file has been sent.\n\n- **notulen.pdf**',
    'Siap, filenya sudah dikirim.\n\n- **notulen.pdf**',
  ],
  [
    'send_file',
    PLAIN_BLOCKS[14]![1],
    'All set, your file has been sent.\n\n- **notulen.pdf** — Sent as an attachment',
    'Siap, filenya sudah dikirim.\n\n- **notulen.pdf** — Terkirim sebagai lampiran',
  ],
  [
    'create_calendar_event',
    PLAIN_BLOCKS[15]![1],
    'All set, your event is saved in Sydia.\n\n- **Rapat** — 22 Sept 2026, 09:00–10:30 · Ruang rapat 2 · Google Calendar sync is pending.',
    'Siap, acara sudah disimpan di Sydia.\n\n- **Rapat** — 22 Sep 2026, 09.00–10.30 · Ruang rapat 2 · Sinkronisasi Google Calendar masih menunggu.',
  ],
  [
    'update_calendar_event',
    PLAIN_BLOCKS[16]![1],
    'All set, your event changes are saved in Sydia.\n\n- **Rapat** — 22 Sept 2026, 09:00–23 Sept 2026, 10:00 · The latest change is synced with Google Calendar.',
    'Siap, perubahan acara sudah disimpan di Sydia.\n\n- **Rapat** — 22 Sep 2026, 09.00–23 Sep 2026, 10.00 · Perubahan terakhir sudah disinkronkan ke Google Calendar.',
  ],
  [
    'cancel_calendar_event',
    PLAIN_BLOCKS[17]![1],
    'All set, the event was cancelled in Sydia.\n\n- **Rapat** — Google Calendar sync is pending.',
    'Siap, acara sudah dibatalkan di Sydia.\n\n- **Rapat** — Sinkronisasi Google Calendar masih menunggu.',
  ],
  [
    'write_daily_note',
    PLAIN_BLOCKS[18]![1],
    '📝 **Daily note written**\n\n**2026-09-22**',
    '📝 **Catatan harian ditulis**\n\n**2026-09-22**',
  ],
  [
    'delete_reminder',
    { deleted: true, reminderId: 'r1', title: 'Minum obat' },
    'All set, your reminder has been deleted.\n\n- **Minum obat**',
    'Siap, pengingatnya sudah dihapus.\n\n- **Minum obat**',
  ],
  [
    'create_contact_group',
    {
      objectType: 'contact_group',
      object: { id: 'g1', name: 'Teman Kerja', contactCount: 2 },
    },
    'All set, your contact group is ready.\n\n- **Teman Kerja** — 2 contacts',
    'Siap, grup kontaknya sudah tersedia.\n\n- **Teman Kerja** — 2 kontak',
  ],
];

describe('terminal tool response', () => {
  it('batches confirmed reminder deletions without claiming every reminder is gone', () => {
    const result = web('id', [
      execution('delete_reminder', {
        deleted: true,
        reminderId: 'r1',
        title: 'Minum obat',
      }),
      execution('delete_reminder', {
        deleted: true,
        reminderId: 'r2',
        title: 'Olahraga',
      }),
    ]);

    expect(result).toBe(
      'Siap, 2 pengingat sudah dihapus.\n\n- **Minum obat**\n- **Olahraga**',
    );
  });

  it('does not confirm reminder deletion from an unsuccessful result', () => {
    expect(
      web('id', [
        execution('delete_reminder', {
          deleted: false,
          reminderId: 'r1',
          title: 'Minum obat',
        }),
      ]),
    ).toBeNull();
  });

  it('keeps newly terminal group creation open when contact assignment must follow', () => {
    const result = web('en', [
      execution(
        'create_contact_group',
        { objectType: 'contact_group', object: { id: 'g1', name: 'Work' } },
        { completeTurn: false },
      ),
    ]);

    expect(result).toBeNull();
  });

  it('batches reminder calls while preserving separate schedules with the same title', () => {
    const result = buildTerminalToolResponse(
      { locale: 'id', timezone: 'Asia/Makassar' },
      [
        execution('create_reminder', {
          reminders: [
            { id: 'r1', title: 'Minum obat', scheduledAt: AT, timezone: 'UTC' },
          ],
        }),
        execution('create_reminder', {
          reminders: [
            {
              id: 'r2',
              title: 'Minum obat',
              scheduledAt: LATER,
              timezone: 'UTC',
            },
          ],
        }),
      ],
    );

    expect(result).toBe(
      'Siap, 2 pengingat sudah dibuat.\n\n- **Minum obat** — Pada 22 Sep 2026, 18.00\n- **Minum obat** — Pada 23 Sep 2026, 18.00',
    );
  });

  it('batches event creations with a local time range and optional location', () => {
    const result = buildTerminalToolResponse(
      { locale: 'id', timezone: 'Asia/Makassar' },
      [
        execution('create_calendar_event', {
          objectType: 'calendar_event',
          object: {
            id: 'e1',
            title: 'Rapat tim',
            startAt: AT,
            endAt: '2026-09-22T11:00:00Z',
            timezone: 'UTC',
            location: 'Kantor',
            syncState: 'pending',
          },
        }),
        execution('create_calendar_event', {
          objectType: 'calendar_event',
          object: {
            id: 'e2',
            title: 'Lokakarya',
            startAt: LATER,
            endAt: '2026-09-24T10:00:00Z',
            timezone: 'UTC',
            syncState: 'pending',
          },
        }),
      ],
    );

    expect(result).toBe(
      'Siap, 2 acara sudah disimpan di Sydia.\n\n- **Rapat tim** — 22 Sep 2026, 18.00–19.00 · Kantor · Sinkronisasi Google Calendar masih menunggu.\n- **Lokakarya** — 23 Sep 2026, 18.00–24 Sep 2026, 18.00 · Sinkronisasi Google Calendar masih menunggu.',
    );
  });

  it('renders all-day events with an exclusive end across Web, Telegram, and WhatsApp', () => {
    const result = {
      objectType: 'calendar_event',
      object: {
        title: 'Conference',
        allDayStartDate: new Date('2026-09-22T00:00:00.000Z'),
        allDayEndDate: new Date('2026-09-24T00:00:00.000Z'),
        syncState: 'pending',
      },
    };

    for (const locale of ['en', 'id'] as const) {
      const heading =
        locale === 'en'
          ? 'All set, your event is saved in Sydia.'
          : 'Siap, acara sudah disimpan di Sydia.';

      const details =
        locale === 'en'
          ? 'All day: 22 Sept 2026–23 Sept 2026 · Google Calendar sync is pending.'
          : 'Sehari penuh: 22 Sep 2026–23 Sep 2026 · Sinkronisasi Google Calendar masih menunggu.';

      for (const channel of ['web', 'telegram', 'whatsapp'] as const) {
        const rendered =
          channel === 'web'
            ? web(locale, [execution('create_calendar_event', result)])
            : chat(
                locale,
                [execution('create_calendar_event', result)],
                channel,
              );

        const title = channel === 'whatsapp' ? 'Conference' : '**Conference**';

        expect(rendered).toBe(`${heading}\n\n- ${title} — ${details}`);
      }
    }
  });

  it.each([
    {
      state: 'local',
      en: 'Sydia only; this event is not synced with Google.',
      id: 'Khusus di Sydia; acara ini tidak disinkronkan ke Google.',
    },
    {
      state: 'pending',
      en: 'Google Calendar sync is pending.',
      id: 'Sinkronisasi Google Calendar masih menunggu.',
    },
    {
      state: 'synced',
      en: 'The latest change is synced with Google Calendar.',
      id: 'Perubahan terakhir sudah disinkronkan ke Google Calendar.',
    },
    {
      state: 'conflict',
      en: 'Google Calendar sync is paused for conflict review.',
      id: 'Sinkronisasi Google Calendar dijeda untuk meninjau konflik.',
    },
    {
      state: 'error',
      en: 'Google Calendar sync failed.',
      id: 'Sinkronisasi Google Calendar gagal.',
    },
    {
      state: 'reconnect_required',
      en: 'Reconnect Google Calendar to resume sync.',
      id: 'Hubungkan kembali Google Calendar untuk melanjutkan sinkronisasi.',
    },
  ])(
    'reports $state calendar delivery accurately on every channel',
    ({ state, en, id }) => {
      for (const locale of ['en', 'id'] as const) {
        const syncDetail = locale === 'en' ? en : id;
        const heading =
          locale === 'en'
            ? 'All set, your event is saved in Sydia.'
            : 'Siap, acara sudah disimpan di Sydia.';

        const date =
          locale === 'en'
            ? '22 Sept 2026, 10:00–11:00 UTC'
            : '22 Sep 2026, 10.00–11.00 UTC';

        const result = {
          objectType: 'calendar_event',
          object: {
            title: 'Rapat',
            startAt: AT,
            endAt: new Date('2026-09-22T11:00:00.000Z'),
            syncState: state,
          },
        };

        for (const channel of ['web', 'telegram', 'whatsapp'] as const) {
          const rendered =
            channel === 'web'
              ? web(locale, [execution('create_calendar_event', result)])
              : chat(
                  locale,
                  [execution('create_calendar_event', result)],
                  channel,
                );

          const title = channel === 'whatsapp' ? 'Rapat' : '**Rapat**';

          expect(rendered).toBe(
            `${heading}\n\n- ${title} — ${date} · ${syncDetail}`,
          );
        }
      }
    },
  );

  it.each([
    {
      name: 'the raw Google Meet link once it exists',
      meet: {
        googleMeetUrl: 'https://meet.google.com/abc-defg-hij',
        googleMeetStatus: 'success',
      },
      en: 'https://meet.google.com/abc-defg-hij',
      id: 'https://meet.google.com/abc-defg-hij',
    },
    {
      name: 'a pending link without claiming it is ready',
      meet: { googleMeetStatus: 'pending' },
      en: "Google Meet link is being created. I'll send it when it's ready.",
      id: 'Link Google Meet sedang dibuat. Saya kirim begitu siap.',
    },
    {
      name: 'a failed link creation',
      meet: { googleMeetStatus: 'failure' },
      en: "Couldn't create the Google Meet link.",
      id: 'Link Google Meet gagal dibuat.',
    },
  ])('reports $name on every channel', ({ meet, en, id }) => {
    for (const locale of ['en', 'id'] as const) {
      const meetDetail = locale === 'en' ? en : id;
      const heading =
        locale === 'en'
          ? 'All set, your event is saved in Sydia.'
          : 'Siap, acara sudah disimpan di Sydia.';

      const date =
        locale === 'en'
          ? '22 Sept 2026, 10:00–11:00 UTC'
          : '22 Sep 2026, 10.00–11.00 UTC';

      const syncDetail =
        locale === 'en'
          ? 'Google Calendar sync is pending.'
          : 'Sinkronisasi Google Calendar masih menunggu.';

      const result = {
        objectType: 'calendar_event',
        object: {
          title: 'Rapat',
          startAt: AT,
          endAt: new Date('2026-09-22T11:00:00.000Z'),
          syncState: 'pending',
          ...meet,
        },
      };

      for (const channel of ['web', 'telegram', 'whatsapp'] as const) {
        const rendered =
          channel === 'web'
            ? web(locale, [execution('create_calendar_event', result)])
            : chat(
                locale,
                [execution('create_calendar_event', result)],
                channel,
              );

        const title = channel === 'whatsapp' ? 'Rapat' : '**Rapat**';

        expect(rendered).toBe(
          `${heading}\n\n- ${title} — ${date} · ${meetDetail} · ${syncDetail}`,
        );
      }
    }
  });

  it('adds no Google Meet line when the event has no video conference', () => {
    const result = {
      objectType: 'calendar_event',
      object: {
        title: 'Rapat',
        startAt: AT,
        endAt: new Date('2026-09-22T11:00:00.000Z'),
        syncState: 'pending',
      },
    };

    for (const locale of ['en', 'id'] as const) {
      const rendered = web(locale, [
        execution('create_calendar_event', result),
      ]);

      expect(rendered).not.toContain('Google Meet');
      expect(rendered).not.toContain('meet.google.com');
    }

    expect(
      web('en', [
        execution('create_calendar_event', {
          objectType: 'calendar_event',
          object: { ...result.object, googleMeetStatus: null },
        }),
      ]),
    ).toBe(
      'All set, your event is saved in Sydia.\n\n- **Rapat** — 22 Sept 2026, 10:00–11:00 UTC · Google Calendar sync is pending.',
    );
  });

  it('refuses the receipt when a Google Meet value is malformed', () => {
    const object = {
      title: 'Rapat',
      startAt: AT,
      endAt: new Date('2026-09-22T11:00:00.000Z'),
      syncState: 'pending',
    };

    expect(
      web('en', [
        execution('create_calendar_event', {
          objectType: 'calendar_event',
          object: { ...object, googleMeetUrl: 'javascript:alert(1)' },
        }),
      ]),
    ).toBeNull();

    expect(
      web('en', [
        execution('create_calendar_event', {
          objectType: 'calendar_event',
          object: { ...object, googleMeetStatus: 'queued' },
        }),
      ]),
    ).toBeNull();
  });

  it('does not infer Google delivery when a calendar result lacks sync state', () => {
    const result = web('en', [
      execution('create_calendar_event', {
        objectType: 'calendar_event',
        object: {
          title: 'Rapat',
          startAt: AT,
          endAt: new Date('2026-09-22T11:00:00.000Z'),
        },
      }),
    ]);

    expect(result).toContain(
      'Google Calendar delivery status is unavailable; it is not confirmed.',
    );
    expect(result).not.toContain('synced with Google Calendar');
  });

  it('batches contacts without altering punctuation in their details', () => {
    const result = chat('en', [
      execution('save_contact', {
        objectType: 'contact',
        object: {
          id: 'c1',
          name: 'Rina',
          email: 'rina+work@example.test',
          phone: '+62 811',
          groups: [{ name: 'Work' }],
        },
      }),
      execution('save_contact', {
        objectType: 'contact',
        object: { id: 'c2', name: 'Adi', phone: '+62 812' },
      }),
    ]);

    expect(result).toBe(
      'All set, 2 contacts have been saved.\n\n- Rina — rina+work@example.test · +62 811 · Groups: Work\n- Adi — +62 812',
    );
  });

  it('batches contact-group updates and keeps confirmed zero counts visible', () => {
    const result = web('id', [
      execution('update_contact_group', {
        objectType: 'contact_group',
        object: { id: 'g1', name: 'Tim', contactCount: 2 },
      }),
      execution('update_contact_group', {
        objectType: 'contact_group',
        object: { id: 'g2', name: 'Teman', contactCount: 0 },
      }),
    ]);

    expect(result).toBe(
      'Siap, 2 grup kontak sudah diperbarui.\n\n- **Tim** — 2 kontak\n- **Teman** — 0 kontak',
    );
  });

  it('shows file size and unfinished processing without claiming content is ready', () => {
    const result = web('id', [
      execution('save_attached_files', {
        objectType: 'documents',
        objects: [
          {
            id: 'd1',
            filename: 'Laporan.pdf',
            mimeType: 'application/pdf',
            size: 1536,
            status: 'processing',
          },
        ],
      }),
      execution('save_attached_files', {
        objectType: 'documents',
        objects: [
          {
            id: 'd2',
            filename: 'Catatan.txt',
            mimeType: 'text/plain',
            size: 0,
            status: 'failed',
          },
        ],
      }),
    ]);

    expect(result).toBe(
      'Siap, 2 file sudah disimpan.\n\n- **Laporan.pdf** — PDF · 1,5 KB · Sedang diproses\n- **Catatan.txt** — TXT · 0 B · Pemrosesan gagal',
    );
  });

  it('counts replayed files once using the latest metadata', () => {
    const result = web('en', [
      execution('save_attached_files', {
        objectType: 'documents',
        objects: [{ id: 'd1', filename: 'Report.pdf', status: 'processing' }],
      }),
      execution('save_attached_files', {
        objectType: 'documents',
        objects: [{ id: 'd1', filename: 'Report.pdf', status: 'ready' }],
      }),
    ]);

    expect(result).toBe(
      'All set, your file has been saved.\n\n- **Report.pdf**',
    );
  });

  it('batches file sends without duplicating web links or pill titles', () => {
    const result = web('en', [
      execution('send_file', {
        objectType: 'file',
        object: {
          documentId: 'd1',
          filename: 'Report.pdf',
          url: 'https://sydia.test/documents/d1/content',
        },
      }),
      execution('send_file', {
        objectType: 'file',
        object: {
          documentId: 'd2',
          filename: 'Budget.pdf',
          url: 'https://sydia.test/documents/d2/content',
        },
      }),
    ]);

    expect(result).toBe(
      'All set, 2 files have been sent.\n\n- **Report.pdf**\n- **Budget.pdf**',
    );
  });

  it('keeps an accessible inline file link when a legacy result has no entity ID', () => {
    const result = web('en', [
      execution('send_file', {
        objectType: 'file',
        object: {
          filename: 'Report [final].pdf',
          url: 'https://sydia.test/files/report(final).pdf',
        },
      }),
    ]);

    expect(result).toBe(
      'All set, your file has been sent.\n\n- [Report \\[final\\].pdf](https://sydia.test/files/report%28final%29.pdf)',
    );
  });

  it('preserves recurrence end dates inline', () => {
    const result = chat('id', [
      execution('update_reminder', {
        objectType: 'reminder',
        object: {
          title: 'Olahraga',
          scheduledAt: AT,
          timezone: 'UTC',
          recurrence: { frequency: 'daily', interval: 1, endsAt: LATER },
        },
      }),
    ]);

    expect(result).toBe(
      'Siap, pengingatnya sudah diperbarui.\n\n- Olahraga — Pada 22 Sep 2026, 10.00 · harian · Hingga 23 Sep 2026, 10.00',
    );
  });

  it.each([
    [
      'save_contact',
      { objectType: 'contact', object: { name: 'Rina', phone: 123 } },
    ],
    [
      'save_attached_files',
      {
        objectType: 'documents',
        objects: [{ filename: 'Report.pdf', size: -1 }],
      },
    ],
    [
      'update_contact_group',
      {
        objectType: 'contact_group',
        object: { name: 'Work', contactCount: -1 },
      },
    ],
    [
      'create_calendar_event',
      {
        objectType: 'calendar_event',
        object: { title: 'Rapat', startAt: LATER, endAt: AT, timezone: 'UTC' },
      },
    ],
  ])('leaves malformed %s metadata for a model reply', (toolName, result) => {
    expect(web('en', [execution(toolName, result)])).toBeNull();
  });

  it('leaves a partially failed contact batch for an honest model reply', () => {
    const result = web('en', [
      execution('save_contact', {
        objectType: 'contact',
        object: { name: 'Rina' },
      }),
      execution('save_contact', { error: 'Save failed' }),
    ]);

    expect(result).toBeNull();
  });

  it('logs an invalid reminder timezone before continuing with the model', () => {
    const warning = jest.spyOn(Logger, 'warn').mockImplementation(() => {});

    try {
      const result = web('en', [
        execution('create_reminder', {
          reminders: [
            {
              title: 'Private reminder',
              scheduledAt: AT,
              timezone: 'Invalid/Zone',
            },
          ],
        }),
      ]);

      expect(result).toBeNull();
      expect(warning).toHaveBeenCalledWith(
        'Acknowledgement formatter failed (RangeError); continuing with model response.',
        'TerminalToolResponse',
      );
    } finally {
      warning.mockRestore();
    }
  });

  it('covers exactly the 20 eligible tools in both tables', () => {
    const names = [...TERMINAL_TOOL_NAMES].sort();
    const plain = [...new Set(PLAIN_BLOCKS.map(([name]) => name))].sort();
    const rich = [...new Set(RICH_BLOCKS.map(([name]) => name))].sort();

    expect(names).toHaveLength(20);
    expect(plain).toEqual(names);
    expect(rich).toEqual(names);
  });

  it.each(PLAIN_BLOCKS)(
    'writes %s as a plain block on WhatsApp',
    (toolName, result, en, id) => {
      expect(chat('en', [execution(toolName, result)])).toBe(en);
      expect(chat('id', [execution(toolName, result)], 'whatsapp')).toBe(id);
    },
  );

  it.each(RICH_BLOCKS)(
    'writes %s as a web block',
    (toolName, result, en, id) => {
      expect(web('en', [execution(toolName, result)])).toBe(en);
      expect(web('id', [execution(toolName, result)])).toBe(id);
    },
  );

  it('keeps WhatsApp plain and formats web and Telegram receipts', () => {
    for (const [toolName, result] of PLAIN_BLOCKS) {
      expect(chat('en', [execution(toolName, result)])).not.toContain('**');
      expect(chat('id', [execution(toolName, result)])).not.toContain('**');
    }

    // Compact tools bold the subject on web and Telegram.
    const contact = {
      objectType: 'contact',
      object: { name: 'Bu Rina', groups: [] },
    };

    expect(web('en', [execution('save_contact', contact)])).toBe(
      'All set, your contact has been saved.\n\n- **Bu Rina**',
    );
    expect(chat('en', [execution('save_contact', contact)])).toBe(
      'All set, your contact has been saved.\n\n- Bu Rina',
    );
    expect(chat('id', [execution('save_contact', contact)], 'telegram')).toBe(
      'Siap, kontaknya sudah disimpan.\n\n- **Bu Rina**',
    );
  });

  it('groups task creations into one web receipt with each task detail', () => {
    const result = buildTerminalToolResponse(
      { locale: 'id', timezone: 'Asia/Makassar' },
      [
        execution('create_task', {
          objectType: 'task',
          object: { title: 'Kirim laporan', dueAt: AT, priority: 'high' },
        }),
        execution('create_task', {
          objectType: 'task',
          object: { title: 'Baca buku', dueAt: null, priority: 'medium' },
        }),
      ],
    );

    expect(result).toBe(
      'Siap, 2 tugas sudah dibuat.\n\n- **Kirim laporan** — Tenggat 22 Sep 2026, 18.00 · Prioritas tinggi\n- **Baca buku**',
    );
  });

  it('formats a Telegram task batch as a native Markdown list', () => {
    const result = chat(
      'en',
      [
        execution('create_task', {
          objectType: 'task',
          object: { title: 'Read book', dueAt: null, priority: 'medium' },
        }),
        execution('create_task', {
          objectType: 'task',
          object: { title: 'Send report', dueAt: null, priority: 'high' },
        }),
      ],
      'telegram',
    );

    expect(result).toBe(
      'All set, 2 tasks have been created.\n\n- **Read book**\n- **Send report** — Priority high',
    );
  });

  it('escapes formatting in literal Telegram task titles and categories', () => {
    const result = chat(
      'en',
      [
        execution('create_task', {
          objectType: 'task',
          object: {
            title: 'Read *draft* <b> $5 ==ready==',
            categories: [{ name: 'Work_2026' }],
          },
        }),
      ],
      'telegram',
    );

    expect(result).toBe(
      'All set, your task has been created.\n\n- **Read \\*draft\\* \\<b\\> \\$5 \\=\\=ready\\=\\=** — Categories: Work\\_2026',
    );
  });

  it('formats Telegram category acknowledgements with literal subjects', () => {
    const result = chat(
      'en',
      [
        execution('update_category', {
          objectType: 'category',
          object: { name: 'Work_2026' },
        }),
      ],
      'telegram',
    );

    expect(result).toBe('✏️ **Category updated**\n\n**Work\\_2026**');
  });

  it('groups task updates into one plain receipt on a channel', () => {
    const result = chat('en', [
      execution('update_task', {
        objectType: 'task',
        object: { title: 'Send report', priority: 'low' },
      }),
      execution('update_task', {
        objectType: 'task',
        object: { title: 'Read book', dueAt: AT },
      }),
    ]);

    expect(result).toBe(
      'All set, 2 tasks have been updated.\n\n- Send report — Priority low\n- Read book — Due 22 Sept 2026, 10:00 UTC',
    );
  });

  it('keeps task creation, updates, and other tool acknowledgements separate', () => {
    const result = web('id', [
      execution('create_task', {
        objectType: 'task',
        object: { title: 'Baca buku' },
      }),
      execution('save_contact', {
        objectType: 'contact',
        object: { name: 'Bu Rina' },
      }),
      execution('update_task', {
        objectType: 'task',
        object: { title: 'Kirim laporan' },
      }),
      execution('create_task', {
        objectType: 'task',
        object: { title: 'Beli kopi' },
      }),
    ]);

    expect(result).toBe(
      'Siap, 2 tugas sudah dibuat.\n\n- **Baca buku**\n- **Beli kopi**\n\nSiap, kontaknya sudah disimpan.\n\n- **Bu Rina**\n\nSiap, tugasnya sudah diperbarui.\n\n- **Kirim laporan**',
    );
  });

  it('does not acknowledge a task batch containing a failed result', () => {
    const result = web('id', [
      execution('create_task', {
        objectType: 'task',
        object: { title: 'Baca buku' },
      }),
      execution('create_task', { error: 'Task creation failed' }),
    ]);

    expect(result).toBeNull();
  });

  it('preserves Markdown punctuation in task titles as literal text', () => {
    const result = web('id', [
      execution('create_task', {
        objectType: 'task',
        object: { title: 'Baca [bab 1] *penting*' },
      }),
    ]);

    expect(result).toBe(
      'Siap, tugasnya sudah dibuat.\n\n- **Baca \\[bab 1\\] \\*penting\\***',
    );
  });

  it('counts a replayed saved task once and uses its newest result', () => {
    const result = web('en', [
      execution('update_task', {
        objectType: 'task',
        object: { id: 'task-1', title: 'Read book', priority: 'high' },
      }),
      execution('update_task', {
        objectType: 'task',
        object: { id: 'task-1', title: 'Read chapter 1', priority: 'low' },
      }),
    ]);

    expect(result).toBe(
      'All set, your task has been updated.\n\n- **Read chapter 1** — Priority low',
    );
  });

  it('keeps a full-length task title available for smart entity matching', () => {
    const title = 'a'.repeat(240);
    const result = web('en', [
      execution('create_task', { objectType: 'task', object: { title } }),
    ]);

    expect(result).toBe(
      `All set, your task has been created.\n\n- **${title}**`,
    );
  });

  it('logs an invalid task timezone and leaves the response to the model', () => {
    const warning = jest.spyOn(Logger, 'warn').mockImplementation(() => {});

    try {
      const result = buildTerminalToolResponse(
        { locale: 'en', timezone: 'Invalid/Zone' },
        [
          execution('create_task', {
            objectType: 'task',
            object: { title: 'Private task title', dueAt: AT },
          }),
        ],
      );

      expect(result).toBeNull();
      expect(warning).toHaveBeenCalledWith(
        'Acknowledgement formatter failed (RangeError); continuing with model response.',
        'TerminalToolResponse',
      );
    } finally {
      warning.mockRestore();
    }
  });

  it('reports the count and each distinct reminder when one call returns several', () => {
    const reminders = [
      {
        title: 'Olahraga',
        scheduledAt: AT,
        timezone: 'UTC',
        recurrence: null,
      },
      {
        title: 'Minum obat',
        scheduledAt: LATER,
        timezone: 'UTC',
        recurrence: { frequency: 'daily', interval: 1 },
      },
    ];

    expect(chat('en', [execution('create_reminder', { reminders })])).toBe(
      'All set, 2 reminders have been created.\n\n- Olahraga — At 22 Sept 2026, 10:00\n- Minum obat — At 23 Sept 2026, 10:00 · daily',
    );
    expect(chat('id', [execution('create_reminder', { reminders })])).toBe(
      'Siap, 2 pengingat sudah dibuat.\n\n- Olahraga — Pada 22 Sep 2026, 10.00\n- Minum obat — Pada 23 Sep 2026, 10.00 · harian',
    );

    // The web receipt retains every schedule and its count.
    expect(web('en', [execution('create_reminder', { reminders })])).toBe(
      'All set, 2 reminders have been created.\n\n- **Olahraga** — At 22 Sept 2026, 10:00\n- **Minum obat** — At 23 Sept 2026, 10:00 · daily',
    );
  });

  it('reports the count and filenames when one call saves several files', () => {
    const files = {
      objectType: 'documents',
      objects: [{ filename: 'notulen.pdf' }, { filename: 'anggaran.pdf' }],
    };

    expect(chat('en', [execution('save_attached_files', files)])).toBe(
      'All set, 2 files have been saved.\n\n- notulen.pdf\n- anggaran.pdf',
    );
    expect(web('id', [execution('save_attached_files', files)])).toBe(
      'Siap, 2 file sudah disimpan.\n\n- **notulen.pdf**\n- **anggaran.pdf**',
    );
  });

  it('renders a single reminder and file as one inline bullet', () => {
    expect(
      chat('en', [
        execution('create_reminder', {
          reminders: [
            {
              title: 'Minum obat',
              scheduledAt: AT,
              timezone: 'UTC',
              recurrence: null,
            },
          ],
        }),
      ]),
    ).toBe(
      'All set, your reminder has been created.\n\n- Minum obat — At 22 Sept 2026, 10:00',
    );

    expect(
      web('id', [
        execution('save_attached_files', {
          objectType: 'documents',
          objects: [{ filename: 'a.pdf' }],
        }),
      ]),
    ).toBe('Siap, filenya sudah disimpan.\n\n- **a.pdf**');
  });

  it('joins several executions of one turn with a blank line', () => {
    expect(
      chat('en', [
        execution('create_task', {
          objectType: 'task',
          object: { title: 'Kirim laporan', dueAt: null },
        }),
        execution('create_reminder', {
          reminders: [
            {
              title: 'Minum obat',
              scheduledAt: AT,
              timezone: 'UTC',
              recurrence: null,
            },
          ],
        }),
      ]),
    ).toBe(
      'All set, your task has been created.\n\n- Kirim laporan\n\nAll set, your reminder has been created.\n\n- Minum obat — At 22 Sept 2026, 10:00',
    );
  });

  it('renders interval and monthly recurrence phrases', () => {
    expect(
      chat('en', [
        execution('update_reminder', {
          objectType: 'reminder',
          object: {
            title: 'Cek stok',
            scheduledAt: AT,
            timezone: 'UTC',
            recurrence: { frequency: 'weekly', interval: 2 },
          },
        }),
      ]),
    ).toBe(
      'All set, your reminder has been updated.\n\n- Cek stok — At 22 Sept 2026, 10:00 · every 2 weeks on the same weekdays',
    );

    expect(
      chat('id', [
        execution('update_reminder', {
          objectType: 'reminder',
          object: {
            title: 'Bayar sewa',
            scheduledAt: AT,
            timezone: 'UTC',
            recurrence: { frequency: 'monthly', interval: 1 },
          },
        }),
      ]),
    ).toBe(
      'Siap, pengingatnya sudah diperbarui.\n\n- Bayar sewa — Pada 22 Sep 2026, 10.00 · bulanan',
    );
  });

  it('renders a due date, priority, and categories on a task', () => {
    const result = {
      objectType: 'task',
      object: {
        title: 'Kirim laporan',
        dueAt: AT,
        priority: 'high',
        categories: [{ name: 'Kerja' }, { name: 'Penting' }],
      },
    };

    expect(chat('en', [execution('create_task', result)])).toBe(
      'All set, your task has been created.\n\n- Kirim laporan — Due 22 Sept 2026, 10:00 UTC · Priority high · Categories: Kerja, Penting',
    );
    expect(chat('id', [execution('create_task', result)])).toBe(
      'Siap, tugasnya sudah dibuat.\n\n- Kirim laporan — Tenggat 22 Sep 2026, 10.00 UTC · Prioritas tinggi · Kategori: Kerja, Penting',
    );
  });

  it('omits a medium priority from the detail lines', () => {
    expect(
      chat('en', [
        execution('update_task', {
          objectType: 'task',
          object: { title: 'Kirim laporan', dueAt: null, priority: 'medium' },
        }),
      ]),
    ).toBe('All set, your task has been updated.\n\n- Kirim laporan');
  });

  it('renders a due date on the user clock when the zone is known', () => {
    const result = {
      objectType: 'task',
      object: { title: 'Kirim laporan', dueAt: AT },
    };

    // 10:00 UTC is 18:00 the same day on the demo user's Makassar clock.
    expect(
      buildTerminalToolResponse(
        { locale: 'id', timezone: 'Asia/Makassar', channel: 'whatsapp' },
        [execution('create_task', result)],
      ),
    ).toBe(
      'Siap, tugasnya sudah dibuat.\n\n- Kirim laporan — Tenggat 22 Sep 2026, 18.00',
    );

    expect(
      buildTerminalToolResponse(
        { locale: 'en', timezone: 'Asia/Makassar', channel: 'whatsapp' },
        [execution('update_task', result)],
      ),
    ).toBe(
      'All set, your task has been updated.\n\n- Kirim laporan — Due 22 Sept 2026, 18:00',
    );
  });

  it('falls back to a labelled UTC instant when no zone is supplied', () => {
    expect(
      chat('en', [
        execution('update_task', {
          objectType: 'task',
          object: { title: 'Kirim laporan', dueAt: AT },
        }),
      ]),
    ).toBe(
      'All set, your task has been updated.\n\n- Kirim laporan — Due 22 Sept 2026, 10:00 UTC',
    );
  });

  it('keeps both send_file branches apart by result shape', () => {
    const link = {
      objectType: 'file',
      object: {
        documentId: 'document-1',
        filename: 'notulen.pdf',
        url: 'https://sydia.test/documents/document-1/content',
        markdownLink:
          '[notulen.pdf](https://sydia.test/documents/document-1/content)',
      },
    };

    const attachment = {
      objectType: 'file',
      object: {
        documentId: 'document-1',
        filename: 'notulen.pdf',
        providerMessageId: 'wamid-1',
      },
    };

    // The web result carries the link and no provider message id.
    expect(web('en', [execution('send_file', link)])).toBe(
      'All set, your file has been sent.\n\n- **notulen.pdf**',
    );
    expect(web('en', [execution('send_file', attachment)])).toBe(
      'All set, your file has been sent.\n\n- **notulen.pdf** — Sent as an attachment',
    );

    // A channel that sent the attachment gets a confirmation, never a link.
    expect(chat('en', [execution('send_file', attachment)])).toBe(
      'All set, your file has been sent.\n\n- notulen.pdf — Sent as an attachment',
    );

    // A channel result that does carry a url gets the bare url, not markdown.
    expect(chat('en', [execution('send_file', link)])).toBe(
      'All set, your file has been sent.\n\n- notulen.pdf — https://sydia.test/documents/document-1/content',
    );
    expect(chat('en', [execution('send_file', link)])).not.toContain('[');

    // A result with neither a link nor a message id claims nothing.
    expect(
      web('en', [
        execution('send_file', {
          objectType: 'file',
          object: { documentId: 'document-1', filename: 'notulen.pdf' },
        }),
      ]),
    ).toBeNull();
  });

  it('declines to end the turn for a non-eligible, unresolved, or opted-out step', () => {
    const task = { objectType: 'task', object: { title: 'Kirim laporan' } };

    expect(web('en', [])).toBeNull();
    expect(web('en', [execution('list_tasks', task)])).toBeNull();
    expect(
      web('en', [
        execution('create_task', task),
        execution('list_tasks', task),
      ]),
    ).toBeNull();
    expect(
      web('en', [execution('create_task', task, { completeTurn: false })]),
    ).toBeNull();
    expect(
      web('en', [execution('create_task', task, { completeTurn: true })]),
    ).toBe('All set, your task has been created.\n\n- **Kirim laporan**');
    expect(
      buildTerminalToolResponse({ locale: 'en', channel: 'whatsapp' }, [
        execution('create_task', task, { completeTurn: true }),
      ]),
    ).toBe('All set, your task has been created.\n\n- Kirim laporan');
  });

  it('lets a later step decide the turn when an earlier call asked for a follow-up', () => {
    const saved = execution(
      'save_attached_files',
      { objectType: 'documents', objects: [{ filename: 'a.pdf' }] },
      { completeTurn: false },
    );

    const sent = execution('send_file', {
      objectType: 'file',
      object: {
        documentId: 'document-1',
        filename: 'a.pdf',
        providerMessageId: 'wamid-1',
      },
    });

    // The earlier call opted out, so it cannot decide, but it is still shown.
    expect(
      buildTerminalToolResponse(
        { locale: 'en', channel: 'whatsapp' },
        [saved, sent],
        [sent],
      ),
    ).toBe(
      'All set, your file has been saved.\n\n- a.pdf\n\nAll set, your file has been sent.\n\n- a.pdf — Sent as an attachment',
    );

    // With `decidedBy` defaulting to every execution, the opt-out blocks it.
    expect(chat('en', [saved, sent])).toBeNull();
  });

  it('returns null instead of claiming success for an unrecognized result', () => {
    expect(web('en', [execution('create_task', null)])).toBeNull();
    expect(
      web('en', [
        execution('create_task', {
          objectType: 'task',
          object: { title: '  ' },
        }),
      ]),
    ).toBeNull();
    expect(
      web('en', [
        execution('create_task', {
          objectType: 'contact',
          object: { name: 'x' },
        }),
      ]),
    ).toBeNull();
    expect(
      web('en', [
        execution('create_task', {
          objectType: 'task',
          object: { title: 'X', priority: 'urgent' },
        }),
      ]),
    ).toBeNull();
    expect(
      web('en', [execution('forget_memory', { deleted: 'yes' })]),
    ).toBeNull();
    expect(
      web('en', [
        execution('update_reminder', {
          objectType: 'reminder',
          object: {
            title: 'X',
            scheduledAt: 'not-a-date',
            timezone: 'UTC',
            recurrence: null,
          },
        }),
      ]),
    ).toBeNull();
    expect(
      web('en', [
        execution('update_reminder', {
          objectType: 'reminder',
          object: {
            title: 'X',
            scheduledAt: AT,
            timezone: 'UTC',
            recurrence: { frequency: 'weekly', interval: 1, daysOfWeek: [9] },
          },
        }),
      ]),
    ).toBeNull();
    expect(
      web('en', [
        execution('send_file', {
          objectType: 'file',
          object: {
            documentId: 'd1',
            filename: 'a.pdf',
            url: 'javascript:alert(1)',
          },
        }),
      ]),
    ).toBeNull();
    expect(
      web('en', [
        execution('create_secret_reveal_link', {
          objectType: 'secret_reveal',
          object: { id: 's1', label: 'ATM', url: null },
        }),
      ]),
    ).toBeNull();
    expect(web('en', [execution('save_contact', { contacts: [] })])).toBeNull();
  });

  it('never repeats a secret value even if one reaches the result', () => {
    const response = chat('en', [
      execution('store_secret', {
        objectType: 'secret',
        object: { id: 'secret-1', label: 'ATM', value: '1234#5678' },
      }),
    ]);

    expect(response).toBe('🔐 Secret stored\n\nATM');
    expect(response).not.toContain('1234#5678');
  });

  it('renders user text verbatim, punctuation included', () => {
    const punctuated: Array<[string, unknown, string]> = [
      [
        'create_task',
        {
          objectType: 'task',
          object: { title: 'Kirim laporan.', dueAt: null },
        },
        'All set, your task has been created.\n\n- Kirim laporan.',
      ],
      [
        'update_category',
        { objectType: 'category', object: { name: 'Kerja.' } },
        '✏️ Category updated\n\nKerja.',
      ],
      [
        'save_contact',
        { objectType: 'contact', object: { name: 'Bu Rina.', groups: [] } },
        'All set, your contact has been saved.\n\n- Bu Rina.',
      ],
      [
        'update_contact_group',
        { objectType: 'contact_group', object: { name: 'Tim.' } },
        'All set, your contact group has been updated.\n\n- Tim.',
      ],
      [
        'cancel_calendar_event',
        {
          objectType: 'calendar_event',
          object: {
            title: 'Rapat laporan.',
            status: 'cancelled',
            syncState: 'local',
          },
        },
        'All set, the event was cancelled in Sydia.\n\n- Rapat laporan. — Sydia only; this event is not synced with Google.',
      ],
      [
        'store_secret',
        { objectType: 'secret', object: { id: 's1', label: 'ATM.' } },
        '🔐 Secret stored\n\nATM.',
      ],
      [
        'save_attached_files',
        { objectType: 'documents', objects: [{ filename: 'notulen.pdf.' }] },
        'All set, your file has been saved.\n\n- notulen.pdf.',
      ],
    ];

    for (const [toolName, result, expected] of punctuated)
      expect(chat('en', [execution(toolName, result)])).toBe(expected);

    // The same values reach the web unchanged, only wrapped in bold.
    expect(
      web('en', [
        execution('create_task', {
          objectType: 'task',
          object: { title: 'Kirim laporan.', dueAt: null },
        }),
      ]),
    ).toBe('All set, your task has been created.\n\n- **Kirim laporan.**');
  });

  it('says a contact has no groups when the group list is empty', () => {
    expect(
      chat('en', [
        execution('assign_contact_groups', {
          objectType: 'contact',
          object: { name: 'Bu Rina', groups: [] },
        }),
      ]),
    ).toBe('All set, your contact has been updated.\n\n- Bu Rina — No groups');

    expect(
      chat('id', [
        execution('assign_contact_groups', {
          objectType: 'contact',
          object: { name: 'Bu Rina', groups: [] },
        }),
      ]),
    ).toBe('Siap, kontaknya sudah diperbarui.\n\n- Bu Rina — Tanpa grup');
  });

  it('collapses user text so a name cannot reflow a block', () => {
    expect(
      chat('en', [
        execution('save_contact', {
          objectType: 'contact',
          object: { name: 'Bu\nRina\t—  “sore”', groups: [] },
        }),
      ]),
    ).toBe('All set, your contact has been saved.\n\n- Bu Rina — “sore”');
  });

  it('adds completeTurn to eligible input schemas only', () => {
    const definition: AssistantToolDefinition = {
      name: 'create_task',
      label: 'Create task',
      description: 'Create a task.',
      parameters: {
        type: 'object',
        properties: { title: { type: 'string' } },
        required: ['title'],
        additionalProperties: false,
      },
    };

    const eligible = terminalToolInputSchema(definition);

    expect(eligible.properties?.completeTurn).toMatchObject({
      type: 'boolean',
    });
    expect(eligible.required).toEqual(['title']);
    expect(definition.parameters.properties).not.toHaveProperty('completeTurn');

    const other: AssistantToolDefinition = {
      ...definition,
      name: 'list_tasks',
    };

    expect(terminalToolInputSchema(other)).toBe(other.parameters);
    expect(TERMINAL_TOOL_NAMES.has('list_tasks')).toBe(false);
    expect(TERMINAL_TOOL_NAMES.has('save_memory')).toBe(false);
  });
});
