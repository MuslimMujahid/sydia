import { telegramWelcomeMessage } from './telegram-welcome';

const indonesianUser = {
  name: 'Rina Kartika',
  preferredAddress: null,
  locale: 'id',
  occupation: null as string | null,
};

describe('telegramWelcomeMessage', () => {
  it('greets an Indonesian user by first name when no preferred address is set', () => {
    expect(telegramWelcomeMessage(indonesianUser)).toMatch(
      /^\*\*Halo, Rina!\*\* Telegram kamu sudah terhubung dengan Sydia\./,
    );
  });

  it('greets by the preferred address over the account name', () => {
    expect(
      telegramWelcomeMessage({
        ...indonesianUser,
        preferredAddress: 'Bu Rina',
      }),
    ).toMatch(/^\*\*Halo, Bu Rina!\*\*/);
  });

  it('introduces the capability examples after an empty line below the greeting', () => {
    expect(telegramWelcomeMessage(indonesianUser)).toMatch(
      /^\*\*Halo, Rina!\*\* Telegram kamu sudah terhubung dengan Sydia\.\n\n\u00a0\n\nBeberapa contoh hal yang bisa aku bantu:\n\n- \*\*Catatan\*\*/,
    );
  });

  it('lists each capability with an example message on its own line', () => {
    expect(telegramWelcomeMessage(indonesianUser)).toContain(
      '- **Tugas & pengingat** — bikin to-do atau pengingat di jam tertentu\\\n  _"Ingetin aku bayar listrik tiap tanggal 20"_',
    );
  });

  it('asks the user to send the reminder back after the capability list', () => {
    expect(telegramWelcomeMessage(indonesianUser)).toContain(
      '\n\n\u00a0\n\nCoba kita mulai dengan hal yang simpel. Kirim balik pesan ini ke aku:\n\n> Ingetin aku minum air 2 menit lagi\n',
    );
  });

  it('offers a two-minute reminder the user can send as written', () => {
    expect(telegramWelcomeMessage(indonesianUser)).toContain(
      '\n> Ingetin aku minum air 2 menit lagi\n',
    );
  });

  it('writes the guide in English for English-locale accounts', () => {
    const message = telegramWelcomeMessage({ ...indonesianUser, locale: 'en' });

    expect(message).toMatch(
      /^\*\*Hi, Rina!\*\* Your Telegram is now connected/,
    );
    expect(message).toContain('\n> Remind me to drink water in 2 minutes\n');
  });

  it('greets without a name when the account cannot be loaded', () => {
    expect(telegramWelcomeMessage(null)).toMatch(
      /^\*\*Halo!\*\* Telegram kamu sudah terhubung/,
    );
  });

  it('uses order examples for a business owner', () => {
    expect(
      telegramWelcomeMessage({
        ...indonesianUser,
        occupation: 'business_owner',
      }),
    ).toContain(
      '- **Catatan** — catat pengeluaran, diary, atau daftar apa pun (bisa dibikin tabel juga lho)\\\n  _"Catat pesanan Bu Sari: 2 kotak brownies, diambil Sabtu"_',
    );
  });

  it('gives a university student campus examples', () => {
    expect(
      telegramWelcomeMessage({
        ...indonesianUser,
        occupation: 'university_student',
      }),
    ).toContain('_"Ingetin aku submit tugas statistik Jumat jam 23.00"_');
  });

  it('falls back to household examples when the answer is unknown', () => {
    expect(
      telegramWelcomeMessage({ ...indonesianUser, occupation: 'astronaut' }),
    ).toContain('_"Ingetin aku bayar listrik tiap tanggal 20"_');
  });
});
