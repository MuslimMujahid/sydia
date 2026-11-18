import type { User, UserOccupation } from '../../database/entities';

type WelcomeRecipient = Pick<
  User,
  'name' | 'preferredAddress' | 'locale' | 'occupation'
>;

/** Example sets; several onboarding answers share one. */
type ExampleGroup = 'household' | 'school' | 'campus' | 'work' | 'business';

const EXAMPLE_GROUP: Record<UserOccupation, ExampleGroup> = {
  homemaker: 'household',
  school_student: 'school',
  university_student: 'campus',
  office_worker: 'work',
  freelancer: 'work',
  business_owner: 'business',
  other: 'household',
};

/** Unanswered or unknown answers use the household set, Sydia's main audience. */
function exampleGroup(occupation: string | null | undefined): ExampleGroup {
  return occupation && occupation in EXAMPLE_GROUP
    ? EXAMPLE_GROUP[occupation as UserOccupation]
    : 'household';
}

type CapabilityExamples = [
  notes: string,
  tasks: string,
  calendar: string,
  contacts: string,
  documents: string,
];

/** One message per capability, in the order of the Indonesian capability list. */
const INDONESIAN_EXAMPLES: Record<ExampleGroup, CapabilityExamples> = {
  household: [
    'Catat belanja hari ini: sayur 25rb, telur 30rb',
    'Ingetin aku bayar listrik tiap tanggal 20',
    'Sabtu jam 4 sore ada les renang anak, masukin ke kalender',
    'Simpan nomor Bu Rina, wali kelas: 0812-3456-7890',
    'Kirimin lagi foto KK yang kemarin aku simpan',
  ],
  school: [
    'Catat materi biologi hari ini: fotosintesis butuh cahaya matahari',
    'Ingetin aku kumpulin PR matematika besok jam 7 pagi',
    'Ujian IPA hari Senin jam 8 pagi, masukin ke kalender',
    'Simpan nomor Pak Budi, wali kelas: 0812-3456-7890',
    'Kirimin lagi foto jadwal pelajaran yang aku simpan',
  ],
  campus: [
    'Catat pengeluaran kos bulan ini: listrik 150rb, galon 20rb',
    'Ingetin aku submit tugas statistik Jumat jam 23.00',
    'Bimbingan skripsi Kamis jam 10 pagi, masukin ke kalender',
    'Simpan nomor Bu Sinta, dosen pembimbing: 0812-3456-7890',
    'Jurnal yang aku simpan kemarin bahas apa aja?',
  ],
  work: [
    'Catat poin meeting hari ini: target bulan depan naik 10%',
    'Ingetin aku kirim laporan mingguan tiap Jumat jam 4 sore',
    'Rapat tim Rabu jam 10 pagi, masukin ke kalender',
    'Simpan nomor Pak Andi, klien PT Maju: 0812-3456-7890',
    'Kirimin lagi kontrak yang aku simpan minggu lalu',
  ],
  business: [
    'Catat pesanan Bu Sari: 2 kotak brownies, diambil Sabtu',
    'Ingetin aku belanja stok tepung tiap Senin pagi',
    'Bazar hari Minggu jam 8 pagi, masukin ke kalender',
    'Simpan nomor Bu Sari, pelanggan tetap: 0812-3456-7890',
    'Kirimin lagi foto nota supplier yang kemarin',
  ],
};

type WelcomeCopy = {
  greeting: (address: string | null) => string;
  capabilitiesIntro: string;
  capabilities: (
    group: ExampleGroup,
  ) => Array<{ name: string; summary: string; example: string }>;
  firstStep: string;
  firstMessage: string;
  outcome: string;
};

// Telegram drops blank lines between blocks; a paragraph holding only a
// no-break space renders as an empty line.
const SPACER = '\u00a0';

const COPY: Record<'id' | 'en', WelcomeCopy> = {
  id: {
    greeting: (address) =>
      `**Halo${address ? `, ${address}` : ''}!** Telegram kamu sudah terhubung dengan Sydia.`,
    capabilitiesIntro: 'Beberapa contoh hal yang bisa aku bantu:',
    capabilities: (group) => {
      const [notes, tasks, calendar, contacts, documents] =
        INDONESIAN_EXAMPLES[group];

      return [
        {
          name: 'Catatan',
          summary:
            'catat pengeluaran, diary, atau daftar apa pun (bisa dibikin tabel juga lho)',
          example: notes,
        },
        {
          name: 'Tugas & pengingat',
          summary: 'bikin to-do atau pengingat di jam tertentu',
          example: tasks,
        },
        {
          name: 'Kalender',
          summary: 'cek jadwal, cari waktu luang, atur acara',
          example: calendar,
        },
        {
          name: 'Kontak',
          summary: 'simpan dan cari kontak atau grup',
          example: contacts,
        },
        {
          name: 'Dokumen',
          summary: 'baca dan kirim file yang sudah tersimpan',
          example: documents,
        },
      ];
    },
    firstStep:
      'Coba kita mulai dengan hal yang simpel. Kirim balik pesan ini ke aku:',
    firstMessage: 'Ingetin aku minum air 2 menit lagi',
    outcome: 'Dalam dua menit, pengingatnya akan muncul di sini.',
  },
  en: {
    greeting: (address) =>
      `**Hi${address ? `, ${address}` : ''}!** Your Telegram is now connected to Sydia.`,
    capabilitiesIntro: 'A few examples of what I can help with:',
    // English accounts are rare; they keep one household set for now.
    capabilities: () => [
      {
        name: 'Notes',
        summary: 'log expenses, a diary, or any list (it can be a table, too)',
        example: "Log today's groceries: vegetables 25k, eggs 30k",
      },
      {
        name: 'Tasks & reminders',
        summary: 'make a to-do or a reminder at a set time',
        example: 'Remind me to pay the electricity bill every 20th',
      },
      {
        name: 'Calendar',
        summary: 'check your schedule, find free time, plan events',
        example: 'Add swimming lessons for the kids on Saturday at 4 pm',
      },
      {
        name: 'Contacts',
        summary: 'save and find contacts or groups',
        example: 'Save Mrs. Rina, the homeroom teacher: 0812-3456-7890',
      },
      {
        name: 'Documents',
        summary: 'read and send files you have saved',
        example: 'Send me the family card photo I saved yesterday',
      },
    ],
    firstStep:
      "Let's start with something simple. Send this message back to me:",
    firstMessage: 'Remind me to drink water in 2 minutes',
    outcome: 'In two minutes, the reminder will show up here.',
  },
};

/**
 * The first message after linking Telegram. It doubles as the getting-started
 * guide: what Sydia can do, with a message to try for each (matched to how the
 * user described themselves in onboarding), then one sentence
 * the user can send as-is, chosen so the reminder fires within a couple of
 * minutes and shows Sydia messaging them first.
 *
 * Telegram renders consecutive blocks without spacing, so the structure comes
 * from spacer paragraphs, a list for the capabilities, and a quote for the
 * sentence to send.
 */
export function telegramWelcomeMessage(user: WelcomeRecipient | null): string {
  const copy = COPY[user?.locale === 'en' ? 'en' : 'id'];
  const capabilities = copy
    .capabilities(exampleGroup(user?.occupation))
    .map(
      ({ name, summary, example }) =>
        // A trailing backslash is a hard line break; a plain newline would be
        // joined into the summary line.
        `- **${name}** — ${summary}\\\n  _"${example}"_`,
    )
    .join('\n');

  return [
    copy.greeting(user ? addressOf(user) : null),
    SPACER,
    copy.capabilitiesIntro,
    capabilities,
    SPACER,
    copy.firstStep,
    `> ${copy.firstMessage}`,
    copy.outcome,
  ].join('\n\n');
}

/** The name chosen in onboarding, or the first name when none was given. */
function addressOf(user: WelcomeRecipient): string | null {
  const preferred = user.preferredAddress?.trim();
  if (preferred) return preferred;

  return user.name.trim().split(/\s+/)[0] || null;
}
