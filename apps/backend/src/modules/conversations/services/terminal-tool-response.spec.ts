import { describe, expect, it } from '@jest/globals';
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

/** The four tools the web chat already renders as an action card. */
const CARD_BACKED = [
  'create_task',
  'update_task',
  'create_reminder',
  'update_reminder',
];

const MEMORY = { memory: { content: 'Suka kopi tanpa gula' } };

function execution(
  toolName: string,
  result: unknown,
  args: unknown = {},
): TerminalToolExecution {
  return { toolCallId: `call-${toolName}`, toolName, arguments: args, result };
}

/** The web chat, which renders markdown and shows action cards. */
function web(
  locale: 'en' | 'id',
  executions: readonly TerminalToolExecution[],
) {
  return buildTerminalToolResponse({ locale }, executions);
}

/** A channel, which sends raw text and shows no cards. */
function chat(
  locale: 'en' | 'id',
  executions: readonly TerminalToolExecution[],
  channel: MessageProvider = 'whatsapp',
) {
  return buildTerminalToolResponse({ locale, channel }, executions);
}

/**
 * The block a channel receives for every tool: heading, blank line, subject,
 * then detail lines. No markdown, because WhatsApp and Telegram render it
 * literally.
 */
const PLAIN_BLOCKS: Array<[string, unknown, string, string]> = [
  [
    'create_task',
    { objectType: 'task', object: { title: 'Kirim laporan', dueAt: null } },
    '✅ Task created\n\nKirim laporan',
    '✅ Tugas dibuat\n\nKirim laporan',
  ],
  [
    'update_task',
    { objectType: 'task', object: { title: 'Kirim laporan', dueAt: AT } },
    '✏️ Task updated\n\nKirim laporan\n🗓️ Due 2026-09-22 10:00 UTC',
    '✏️ Tugas diperbarui\n\nKirim laporan\n🗓️ Tenggat 2026-09-22 10:00 UTC',
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
    '⏰ Reminder created\n\nMinum obat\n🗓️ 2026-09-22 17:00',
    '⏰ Pengingat dibuat\n\nMinum obat\n🗓️ 2026-09-22 17:00',
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
    '⏰ Reminder updated\n\nMinum obat\n🗓️ 2026-09-22 17:00 (weekly on Tuesday, Thursday)',
    '⏰ Pengingat diperbarui\n\nMinum obat\n🗓️ 2026-09-22 17:00 (mingguan pada Selasa, Kamis)',
  ],
  [
    'save_memory',
    { memory: { content: 'Suka kopi tanpa gula' } },
    '🧠 Memory saved\n\nSuka kopi tanpa gula',
    '🧠 Memori disimpan\n\nSuka kopi tanpa gula',
  ],
  [
    'update_memory',
    { memory: { content: 'Suka kopi hitam', category: 'Preferensi' } },
    '🧠 Memory updated\n\nSuka kopi hitam\n🏷️ Preferensi',
    '🧠 Memori diperbarui\n\nSuka kopi hitam\n🏷️ Preferensi',
  ],
  [
    'forget_memory',
    { deleted: true, memoryId: 'memory-1' },
    '🗑️ Memory forgotten',
    '🗑️ Memori dihapus',
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
    '👤 Contact saved\n\nBu Rina\n📧 rina@example.test\n📞 +62 811 000\n👥 Teman Kerja',
    '👤 Kontak disimpan\n\nBu Rina\n📧 rina@example.test\n📞 +62 811 000\n👥 Teman Kerja',
  ],
  [
    'update_contact_group',
    { objectType: 'contact_group', object: { name: 'Teman Kerja' } },
    '🏷️ Contact group updated\n\nTeman Kerja',
    '🏷️ Grup kontak diperbarui\n\nTeman Kerja',
  ],
  [
    'delete_contact_group',
    { objectType: 'contact_group', object: { name: 'Teman Kerja' } },
    '🗑️ Contact group deleted\n\nTeman Kerja',
    '🗑️ Grup kontak dihapus\n\nTeman Kerja',
  ],
  [
    'assign_contact_groups',
    {
      objectType: 'contact',
      object: { name: 'Bu Rina', groups: [{ name: 'Teman Kerja' }] },
    },
    '🏷️ Contact groups updated\n\nBu Rina\n👥 Teman Kerja',
    '🏷️ Grup kontak diperbarui\n\nBu Rina\n👥 Teman Kerja',
  ],
  [
    'save_attached_files',
    {
      objectType: 'documents',
      objects: [{ filename: 'notulen.pdf' }, { filename: 'anggaran.pdf' }],
    },
    '📎 Files saved (2)\n\n📄 notulen.pdf\n📄 anggaran.pdf',
    '📎 2 file disimpan\n\n📄 notulen.pdf\n📄 anggaran.pdf',
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
    '📤 File sent\n\nnotulen.pdf\n🔗 https://sydia.test/documents/document-1/content',
    '📤 File dikirim\n\nnotulen.pdf\n🔗 https://sydia.test/documents/document-1/content',
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
    '📤 File sent\n\nnotulen.pdf\n📌 Sent as an attachment',
    '📤 File dikirim\n\nnotulen.pdf\n📌 Terkirim sebagai lampiran',
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
      },
    },
    '📅 Event created\n\nRapat\n🗓️ 2026-09-22 09:00–10:30\n📍 Ruang rapat 2',
    '📅 Acara dibuat\n\nRapat\n🗓️ 2026-09-22 09:00–10:30\n📍 Ruang rapat 2',
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
      },
    },
    '📅 Event updated\n\nRapat\n🗓️ 2026-09-22 09:00–2026-09-23 10:00',
    '📅 Acara diperbarui\n\nRapat\n🗓️ 2026-09-22 09:00–2026-09-23 10:00',
  ],
  [
    'cancel_calendar_event',
    {
      objectType: 'calendar_event',
      object: { title: 'Rapat', status: 'cancelled' },
    },
    '📅 Event cancelled\n\nRapat\n📌 Cancelled',
    '📅 Acara dibatalkan\n\nRapat\n📌 Dibatalkan',
  ],
  [
    'write_daily_note',
    { date: '2026-09-22', written: '## Kerja\n- kirim laporan', noteId: 'n1' },
    '📝 Daily note written\n\n2026-09-22',
    '📝 Catatan harian ditulis\n\n2026-09-22',
  ],
];

/**
 * The web block for the same results: identical layout, with the heading and
 * subject in markdown bold — except the four tools the chat already renders as
 * an action card, which collapse to the bare heading so the text does not
 * restate the card beside it.
 */
const RICH_BLOCKS: Array<[string, unknown, string, string]> = [
  ['create_task', PLAIN_BLOCKS[0]![1], '✅ Task created', '✅ Tugas dibuat'],
  [
    'update_task',
    PLAIN_BLOCKS[1]![1],
    '✏️ Task updated',
    '✏️ Tugas diperbarui',
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
    '⏰ Reminder created',
    '⏰ Pengingat dibuat',
  ],
  [
    'update_reminder',
    PLAIN_BLOCKS[5]![1],
    '⏰ Reminder updated',
    '⏰ Pengingat diperbarui',
  ],
  [
    'save_memory',
    PLAIN_BLOCKS[6]![1],
    '🧠 **Memory saved**\n\n**Suka kopi tanpa gula**',
    '🧠 **Memori disimpan**\n\n**Suka kopi tanpa gula**',
  ],
  [
    'update_memory',
    PLAIN_BLOCKS[7]![1],
    '🧠 **Memory updated**\n\n**Suka kopi hitam**\n🏷️ Preferensi',
    '🧠 **Memori diperbarui**\n\n**Suka kopi hitam**\n🏷️ Preferensi',
  ],
  [
    'forget_memory',
    PLAIN_BLOCKS[8]![1],
    '🗑️ **Memory forgotten**',
    '🗑️ **Memori dihapus**',
  ],
  [
    'store_secret',
    PLAIN_BLOCKS[9]![1],
    '🔐 **Secret stored**\n\n**ATM**',
    '🔐 **Rahasia disimpan**\n\n**ATM**',
  ],
  [
    'create_secret_reveal_link',
    PLAIN_BLOCKS[10]![1],
    '🔗 **Reveal link created**\n\n**ATM**\n🔗 https://sydia.test/secret-reveal#token\n🗓️ 2026-09-22 10:00 UTC',
    '🔗 **Tautan dibuat**\n\n**ATM**\n🔗 https://sydia.test/secret-reveal#token\n🗓️ 2026-09-22 10:00 UTC',
  ],
  [
    'save_contact',
    PLAIN_BLOCKS[11]![1],
    '👤 **Contact saved**\n\n**Bu Rina**\n📧 rina@example.test\n📞 +62 811 000\n👥 Teman Kerja',
    '👤 **Kontak disimpan**\n\n**Bu Rina**\n📧 rina@example.test\n📞 +62 811 000\n👥 Teman Kerja',
  ],
  [
    'update_contact_group',
    PLAIN_BLOCKS[12]![1],
    '🏷️ **Contact group updated**\n\n**Teman Kerja**',
    '🏷️ **Grup kontak diperbarui**\n\n**Teman Kerja**',
  ],
  [
    'delete_contact_group',
    PLAIN_BLOCKS[13]![1],
    '🗑️ **Contact group deleted**\n\n**Teman Kerja**',
    '🗑️ **Grup kontak dihapus**\n\n**Teman Kerja**',
  ],
  [
    'assign_contact_groups',
    PLAIN_BLOCKS[14]![1],
    '🏷️ **Contact groups updated**\n\n**Bu Rina**\n👥 Teman Kerja',
    '🏷️ **Grup kontak diperbarui**\n\n**Bu Rina**\n👥 Teman Kerja',
  ],
  [
    'save_attached_files',
    PLAIN_BLOCKS[15]![1],
    '📎 **Files saved (2)**\n\n📄 notulen.pdf\n📄 anggaran.pdf',
    '📎 **2 file disimpan**\n\n📄 notulen.pdf\n📄 anggaran.pdf',
  ],
  [
    'send_file',
    PLAIN_BLOCKS[16]![1],
    '📤 **File sent**\n\n**notulen.pdf**\n🔗 [notulen.pdf](https://sydia.test/documents/document-1/content)',
    '📤 **File dikirim**\n\n**notulen.pdf**\n🔗 [notulen.pdf](https://sydia.test/documents/document-1/content)',
  ],
  [
    'send_file',
    PLAIN_BLOCKS[17]![1],
    '📤 **File sent**\n\n**notulen.pdf**\n📌 Sent as an attachment',
    '📤 **File dikirim**\n\n**notulen.pdf**\n📌 Terkirim sebagai lampiran',
  ],
  [
    'create_calendar_event',
    PLAIN_BLOCKS[18]![1],
    '📅 **Event created**\n\n**Rapat**\n🗓️ 2026-09-22 09:00–10:30\n📍 Ruang rapat 2',
    '📅 **Acara dibuat**\n\n**Rapat**\n🗓️ 2026-09-22 09:00–10:30\n📍 Ruang rapat 2',
  ],
  [
    'update_calendar_event',
    PLAIN_BLOCKS[19]![1],
    '📅 **Event updated**\n\n**Rapat**\n🗓️ 2026-09-22 09:00–2026-09-23 10:00',
    '📅 **Acara diperbarui**\n\n**Rapat**\n🗓️ 2026-09-22 09:00–2026-09-23 10:00',
  ],
  [
    'cancel_calendar_event',
    PLAIN_BLOCKS[20]![1],
    '📅 **Event cancelled**\n\n**Rapat**\n📌 Cancelled',
    '📅 **Acara dibatalkan**\n\n**Rapat**\n📌 Dibatalkan',
  ],
  [
    'write_daily_note',
    PLAIN_BLOCKS[21]![1],
    '📝 **Daily note written**\n\n**2026-09-22**',
    '📝 **Catatan harian ditulis**\n\n**2026-09-22**',
  ],
];

describe('terminal tool response', () => {
  it('covers exactly the 21 eligible tools in both tables', () => {
    const names = [...TERMINAL_TOOL_NAMES].sort();
    const plain = [...new Set(PLAIN_BLOCKS.map(([name]) => name))].sort();
    const rich = [...new Set(RICH_BLOCKS.map(([name]) => name))].sort();

    expect(names).toHaveLength(21);
    expect(plain).toEqual(names);
    expect(rich).toEqual(names);
  });

  it.each(PLAIN_BLOCKS)(
    'writes %s as a plain block on a channel',
    (toolName, result, en, id) => {
      expect(chat('en', [execution(toolName, result)])).toBe(en);
      expect(chat('id', [execution(toolName, result)], 'telegram')).toBe(id);
    },
  );

  it.each(RICH_BLOCKS)(
    'writes %s as a web block',
    (toolName, result, en, id) => {
      expect(web('en', [execution(toolName, result)])).toBe(en);
      expect(web('id', [execution(toolName, result)])).toBe(id);
    },
  );

  it('never emits markdown on a channel and always on the web', () => {
    for (const [toolName, result] of PLAIN_BLOCKS) {
      expect(chat('en', [execution(toolName, result)])).not.toContain('**');
      expect(chat('id', [execution(toolName, result)])).not.toContain('**');
    }

    // The web block bolds the heading and the subject; the heading keeps its
    // icon outside the bold so the marker opens on the words.
    expect(web('en', [execution('save_memory', MEMORY)])).toBe(
      '🧠 **Memory saved**\n\n**Suka kopi tanpa gula**',
    );
    expect(chat('en', [execution('save_memory', MEMORY)])).toBe(
      '🧠 Memory saved\n\nSuka kopi tanpa gula',
    );
    expect(chat('id', [execution('save_memory', MEMORY)], 'telegram')).toBe(
      '🧠 Memori disimpan\n\nSuka kopi tanpa gula',
    );

    const plainHeadings: Record<string, string> = Object.fromEntries(
      PLAIN_BLOCKS.map(([name, , en]) => [name, en.split('\n')[0]!]),
    );

    for (const [toolName, result] of RICH_BLOCKS) {
      const rich = web('en', [execution(toolName, result)])!.split('\n')[0]!;
      const plain = plainHeadings[toolName]!;
      const [icon, ...words] = plain.split(' ');
      const bolded = `${icon} **${words.join(' ')}**`;

      expect(rich).toBe(CARD_BACKED.includes(toolName) ? plain : bolded);
      expect(rich.includes('**')).toBe(!CARD_BACKED.includes(toolName));
    }
  });

  it('leaves card-backed tools on the web as a bare heading', () => {
    for (const [toolName, result, , id] of RICH_BLOCKS) {
      if (!CARD_BACKED.includes(toolName)) continue;

      const english = web('en', [execution(toolName, result)])!;
      const indonesian = web('id', [execution(toolName, result)])!;

      // Heading only: no bold, no blank line, no subject, no detail lines.
      expect(english.split('\n')).toHaveLength(1);
      expect(indonesian.split('\n')).toHaveLength(1);
      expect(english).not.toContain('**');
      expect(indonesian).not.toContain('**');

      // The card is web-only, so a channel still receives the whole block.
      const sent = chat('en', [execution(toolName, result)])!;

      expect(sent).not.toBe(english);
      expect(sent.split('\n\n')).toHaveLength(2);
      expect(sent.split('\n')[0]).toBe(english);
      expect(id.split('\n')).toHaveLength(1);
    }
  });

  it('keeps a non-card-backed tool in full on the web', () => {
    const [toolName, result] = PLAIN_BLOCKS.find(
      ([name]) => name === 'save_memory',
    )!;

    expect(web('en', [execution(toolName, result)])).toBe(
      '🧠 **Memory saved**\n\n**Suka kopi tanpa gula**',
    );
    expect(chat('en', [execution(toolName, result)])).toBe(
      '🧠 Memory saved\n\nSuka kopi tanpa gula',
    );
  });

  it('counts the items when one call returns several', () => {
    const reminders = [
      {
        title: 'Olahraga',
        scheduledAt: AT,
        timezone: 'UTC',
        recurrence: null,
      },
      {
        title: 'Olahraga',
        scheduledAt: LATER,
        timezone: 'UTC',
        recurrence: { frequency: 'daily', interval: 1 },
      },
    ];

    expect(chat('en', [execution('create_reminder', { reminders })])).toBe(
      '⏰ Reminder created (2)\n\n⏰ Olahraga · 2026-09-22 10:00\n⏰ Olahraga · 2026-09-23 10:00 (daily)',
    );
    expect(chat('id', [execution('create_reminder', { reminders })])).toBe(
      '⏰ 2 pengingat dibuat\n\n⏰ Olahraga · 2026-09-22 10:00\n⏰ Olahraga · 2026-09-23 10:00 (harian)',
    );

    // A web card-backed heading still carries the count.
    expect(web('en', [execution('create_reminder', { reminders })])).toBe(
      '⏰ Reminder created (2)',
    );

    const files = {
      objectType: 'documents',
      objects: [{ filename: 'notulen.pdf' }, { filename: 'anggaran.pdf' }],
    };

    expect(chat('en', [execution('save_attached_files', files)])).toBe(
      '📎 Files saved (2)\n\n📄 notulen.pdf\n📄 anggaran.pdf',
    );
    expect(web('id', [execution('save_attached_files', files)])).toBe(
      '📎 **2 file disimpan**\n\n📄 notulen.pdf\n📄 anggaran.pdf',
    );
  });

  it('renders a single-item reminder and file as a subject, not a list', () => {
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
    ).toBe('⏰ Reminder created\n\nMinum obat\n🗓️ 2026-09-22 10:00');

    expect(
      web('id', [
        execution('save_attached_files', {
          objectType: 'documents',
          objects: [{ filename: 'a.pdf' }],
        }),
      ]),
    ).toBe('📎 **File disimpan**\n\n**a.pdf**');
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
      '✅ Task created\n\nKirim laporan\n\n⏰ Reminder created\n\nMinum obat\n🗓️ 2026-09-22 10:00',
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
      '⏰ Reminder updated\n\nCek stok\n🗓️ 2026-09-22 10:00 (every 2 weeks on the same weekdays)',
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
      '⏰ Pengingat diperbarui\n\nBayar sewa\n🗓️ 2026-09-22 10:00 (bulanan)',
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
      '✅ Task created\n\nKirim laporan\n🗓️ Due 2026-09-22 10:00 UTC\n⚡ Priority high\n🏷️ Kerja, Penting',
    );
    expect(chat('id', [execution('create_task', result)])).toBe(
      '✅ Tugas dibuat\n\nKirim laporan\n🗓️ Tenggat 2026-09-22 10:00 UTC\n⚡ Prioritas tinggi\n🏷️ Kerja, Penting',
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
    ).toBe('✏️ Task updated\n\nKirim laporan');
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
    ).toBe('✅ Tugas dibuat\n\nKirim laporan\n🗓️ Tenggat 2026-09-22 18:00');

    expect(
      buildTerminalToolResponse(
        { locale: 'en', timezone: 'Asia/Makassar', channel: 'whatsapp' },
        [execution('update_task', result)],
      ),
    ).toBe('✏️ Task updated\n\nKirim laporan\n🗓️ Due 2026-09-22 18:00');
  });

  it('falls back to a labelled UTC instant when no zone is supplied', () => {
    expect(
      chat('en', [
        execution('update_task', {
          objectType: 'task',
          object: { title: 'Kirim laporan', dueAt: AT },
        }),
      ]),
    ).toBe('✏️ Task updated\n\nKirim laporan\n🗓️ Due 2026-09-22 10:00 UTC');
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
      '📤 **File sent**\n\n**notulen.pdf**\n🔗 [notulen.pdf](https://sydia.test/documents/document-1/content)',
    );
    expect(web('en', [execution('send_file', attachment)])).toBe(
      '📤 **File sent**\n\n**notulen.pdf**\n📌 Sent as an attachment',
    );

    // A channel that sent the attachment gets a confirmation, never a link.
    expect(chat('en', [execution('send_file', attachment)])).toBe(
      '📤 File sent\n\nnotulen.pdf\n📌 Sent as an attachment',
    );

    // A channel result that does carry a url gets the bare url, not markdown.
    expect(chat('en', [execution('send_file', link)])).toBe(
      '📤 File sent\n\nnotulen.pdf\n🔗 https://sydia.test/documents/document-1/content',
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
    ).toBe('✅ Task created');
    expect(
      buildTerminalToolResponse({ locale: 'en', channel: 'whatsapp' }, [
        execution('create_task', task, { completeTurn: true }),
      ]),
    ).toBe('✅ Task created\n\nKirim laporan');
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
      '📎 Files saved\n\na.pdf\n\n📤 File sent\n\na.pdf\n📌 Sent as an attachment',
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

  it('shows the transient reveal url exactly once', () => {
    const response = chat('en', [
      execution('create_secret_reveal_link', {
        objectType: 'secret_reveal',
        object: {
          id: 'secret-1',
          label: 'ATM',
          url: 'https://sydia.test/secret-reveal#token',
          expiresAt: AT,
        },
      }),
    ])!;

    expect(
      response.match(/https:\/\/sydia\.test\/secret-reveal#token/gu),
    ).toHaveLength(1);
  });

  it('renders user text verbatim, punctuation included', () => {
    const punctuated: Array<[string, unknown, string]> = [
      [
        'create_task',
        {
          objectType: 'task',
          object: { title: 'Kirim laporan.', dueAt: null },
        },
        '✅ Task created\n\nKirim laporan.',
      ],
      [
        'update_category',
        { objectType: 'category', object: { name: 'Kerja.' } },
        '✏️ Category updated\n\nKerja.',
      ],
      [
        'save_contact',
        { objectType: 'contact', object: { name: 'Bu Rina.', groups: [] } },
        '👤 Contact saved\n\nBu Rina.',
      ],
      [
        'update_contact_group',
        { objectType: 'contact_group', object: { name: 'Tim.' } },
        '🏷️ Contact group updated\n\nTim.',
      ],
      [
        'cancel_calendar_event',
        {
          objectType: 'calendar_event',
          object: { title: 'Rapat laporan.', status: 'cancelled' },
        },
        '📅 Event cancelled\n\nRapat laporan.\n📌 Cancelled',
      ],
      [
        'store_secret',
        { objectType: 'secret', object: { id: 's1', label: 'ATM.' } },
        '🔐 Secret stored\n\nATM.',
      ],
      [
        'save_memory',
        { memory: { content: 'Suka kopi tanpa gula.' } },
        '🧠 Memory saved\n\nSuka kopi tanpa gula.',
      ],
      [
        'save_attached_files',
        { objectType: 'documents', objects: [{ filename: 'notulen.pdf.' }] },
        '📎 Files saved\n\nnotulen.pdf.',
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
    ).toBe('✅ Task created');
    expect(
      web('en', [
        execution('save_memory', {
          memory: { content: 'Suka kopi tanpa gula.' },
        }),
      ]),
    ).toBe('🧠 **Memory saved**\n\n**Suka kopi tanpa gula.**');
  });

  it('says a contact has no groups when the group list is empty', () => {
    expect(
      chat('en', [
        execution('assign_contact_groups', {
          objectType: 'contact',
          object: { name: 'Bu Rina', groups: [] },
        }),
      ]),
    ).toBe('🏷️ Contact groups updated\n\nBu Rina\n👥 No groups');

    expect(
      chat('id', [
        execution('assign_contact_groups', {
          objectType: 'contact',
          object: { name: 'Bu Rina', groups: [] },
        }),
      ]),
    ).toBe('🏷️ Grup kontak diperbarui\n\nBu Rina\n👥 Tanpa grup');
  });

  it('collapses user text so a name cannot reflow a block', () => {
    expect(
      chat('en', [
        execution('save_contact', {
          objectType: 'contact',
          object: { name: 'Bu\nRina\t—  “sore”', groups: [] },
        }),
      ]),
    ).toBe('👤 Contact saved\n\nBu Rina — “sore”');
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
    expect(TERMINAL_TOOL_NAMES.has('save_memory')).toBe(true);
  });

  it('renders the four headline examples in both locales', () => {
    const task = {
      objectType: 'task',
      object: {
        title: 'Kirim laporan',
        dueAt: AT,
        priority: 'high',
        categories: [{ name: 'Kerja' }],
      },
    };

    const reminders = {
      reminders: [
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
          recurrence: null,
        },
      ],
    };

    const file = {
      objectType: 'file',
      object: {
        documentId: 'document-1',
        filename: 'notulen.pdf',
        url: 'https://sydia.test/documents/document-1/content',
        markdownLink:
          '[notulen.pdf](https://sydia.test/documents/document-1/content)',
      },
    };

    const secret = {
      objectType: 'secret',
      object: { id: 'secret-1', label: 'ATM' },
    };

    expect(web('en', [execution('create_task', task)])).toBe('✅ Task created');
    expect(web('id', [execution('create_task', task)])).toBe('✅ Tugas dibuat');

    expect(chat('en', [execution('create_task', task)])).toBe(
      '✅ Task created\n\nKirim laporan\n🗓️ Due 2026-09-22 10:00 UTC\n⚡ Priority high\n🏷️ Kerja',
    );
    expect(chat('id', [execution('create_task', task)])).toBe(
      '✅ Tugas dibuat\n\nKirim laporan\n🗓️ Tenggat 2026-09-22 10:00 UTC\n⚡ Prioritas tinggi\n🏷️ Kerja',
    );

    expect(chat('en', [execution('create_reminder', reminders)])).toBe(
      '⏰ Reminder created (2)\n\n⏰ Olahraga · 2026-09-22 10:00\n⏰ Minum obat · 2026-09-23 10:00',
    );
    expect(chat('id', [execution('create_reminder', reminders)])).toBe(
      '⏰ 2 pengingat dibuat\n\n⏰ Olahraga · 2026-09-22 10:00\n⏰ Minum obat · 2026-09-23 10:00',
    );

    expect(web('en', [execution('send_file', file)])).toBe(
      '📤 **File sent**\n\n**notulen.pdf**\n🔗 [notulen.pdf](https://sydia.test/documents/document-1/content)',
    );
    expect(web('id', [execution('send_file', file)])).toBe(
      '📤 **File dikirim**\n\n**notulen.pdf**\n🔗 [notulen.pdf](https://sydia.test/documents/document-1/content)',
    );

    expect(chat('en', [execution('store_secret', secret)])).toBe(
      '🔐 Secret stored\n\nATM',
    );
    expect(chat('id', [execution('store_secret', secret)])).toBe(
      '🔐 Rahasia disimpan\n\nATM',
    );
    expect(web('en', [execution('store_secret', secret)])).toBe(
      '🔐 **Secret stored**\n\n**ATM**',
    );
    expect(web('id', [execution('store_secret', secret)])).toBe(
      '🔐 **Rahasia disimpan**\n\n**ATM**',
    );
  });
});
