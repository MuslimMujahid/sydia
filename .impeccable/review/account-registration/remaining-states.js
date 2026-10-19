// Execute in the connected Penpot MCP plugin after setup.js and screens.js.
// Keep explicit recovery states separate from happy-path screens.
const A = storage.auth;
if (!A) throw Error("Account registration design helpers are not loaded.");
A.stateDefinitions = [
  {
    key: "wrong-code",
    title: "Kode belum cocok",
    message: "Periksa kembali kode di email Anda.\nSisa percobaan: 4.",
    action: "Coba lagi",
    target: "verify-ready",
    otp: "482910",
  },
  {
    key: "expired-code",
    title: "Kode sudah kedaluwarsa",
    message:
      "Minta kode baru untuk melanjutkan.\nKode sebelumnya tidak bisa digunakan.",
    action: "Kirim kode baru",
    target: "verify",
  },
  {
    key: "attempt-limit",
    title: "Batas percobaan tercapai",
    message:
      "Kode dinonaktifkan setelah 5 percobaan salah.\nMinta kode baru untuk melanjutkan.",
    action: "Minta kode baru",
    target: "verify",
  },
  {
    key: "delivery-failed",
    title: "Kode belum terkirim",
    message:
      "Email verifikasi gagal dikirim.\nPeriksa alamat email Anda, lalu coba lagi.",
    action: "Coba kirim lagi",
    target: "verify",
  },
  {
    key: "send-limit",
    title: "Tunggu sebelum mencoba lagi",
    message:
      "Terlalu banyak permintaan kode.\nCoba lagi setelah waktu tunggu berakhir.",
    action: "Kembali ke verifikasi",
    target: "verify",
  },
  {
    key: "email-conflict",
    title: "Email sudah digunakan",
    message: "Gunakan alamat email lain.\nAkun dan data Anda belum berubah.",
    action: "Ubah alamat email",
    target: "change-email",
  },
  {
    key: "google-cancelled",
    title: "Belum masuk dengan Google",
    message:
      "Proses masuk dibatalkan.\nAnda dapat mencoba lagi atau memakai kata sandi.",
    action: "Kembali ke masuk",
    target: "signin",
  },
  {
    key: "google-unverified",
    title: "Verifikasi email diperlukan",
    message:
      "Email dari Google belum dapat diverifikasi.\nLanjutkan dengan kode yang dikirim ke email Anda.",
    action: "Verifikasi email",
    target: "verify",
  },
  {
    key: "calendar-denied",
    title: "Kalender belum terhubung",
    message:
      "Izin kalender belum diberikan.\nAkun Sydia Anda tetap siap digunakan.",
    action: "Coba hubungkan lagi",
    target: "settings-unconnected",
    secondary: "Lewati untuk sekarang",
    secondaryTarget: "settings",
  },
  {
    key: "calendar-failed",
    title: "Koneksi kalender belum selesai",
    message:
      "Google Calendar belum dapat dihubungkan.\nCoba lagi atau hubungkan nanti di Pengaturan.",
    action: "Coba lagi",
    target: "settings-unconnected",
    secondary: "Lanjutkan tanpa kalender",
    secondaryTarget: "settings",
  },
  {
    key: "identity-rejected",
    title: "Konfirmasi akun belum berhasil",
    message:
      "Kata sandi tidak cocok.\nCoba lagi atau pulihkan kata sandi Anda.",
    action: "Coba lagi",
    target: "change-email",
    secondary: "Lupa kata sandi?",
    secondaryTarget: "forgot",
  },
  {
    key: "recovery-unavailable",
    title: "Belum bisa memulihkan akun",
    message:
      "Gunakan metode masuk yang sudah terhubung.\nTanpa akses email atau login, pemulihan otomatis\nbelum tersedia.",
    action: "Kembali ke masuk",
    target: "signin",
  },
];
A.renderRecoveryState = (s, d) => {
  s.y = s.m ? 136 : 212;
  let y = A.heading(s, d.title, "");
  A.notice(s.b, d.message, s.x, y, s.w, { error: true });
  y += d.message.split("\n").length > 2 ? 134 : 116;
  if (d.otp) {
    A.otp(s.b, s.x, y, s.w, { value: d.otp, error: true, focus: false });
    y += 124;
  }
  A.button(s.b, d.action, s.x, y, s.w, "aurora", s.prefix + d.target);
  if (d.secondary)
    A.link(s.b, d.secondary, s.x, y + 64, s.w, s.prefix + d.secondaryTarget);
};
return { preparedStates: A.stateDefinitions.length };
