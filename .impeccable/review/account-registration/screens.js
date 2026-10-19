const A = storage.auth;
A.render = {};
A.render.signup = (s) => {
  let y = A.heading(
    s,
    "Buat akun Anda",
    "Mulai percakapan pertama Anda dengan Sydia."
  );
  A.button(
    s.b,
    "Lanjutkan dengan Google",
    s.x,
    y,
    s.w,
    "google",
    s.prefix + "settings-unconnected"
  );
  A.divider(s.b, s.x, y + 70, s.w, "atau dengan email");
  y += 104;
  A.field(s.b, "Nama", "Nama lengkap Anda", s.x, y, s.w);
  A.field(s.b, "Email", "nama@contoh.com", s.x, y + 96, s.w);
  A.field(s.b, "Kata sandi", "Minimal 8 karakter", s.x, y + 192, s.w, {
    password: true,
  });
  A.text(
    s.b,
    "Email Anda akan diverifikasi sebelum melanjutkan.",
    s.x,
    y + 282,
    s.w,
    13,
    400,
    A.C.muted
  );
  A.button(s.b, "Buat akun", s.x, y + 322, s.w, "aurora", s.prefix + "verify");
  A.footer(s, "Sudah punya akun? Masuk", "signin", y + 398);
};
A.render.verify = (s) => {
  s.y = s.m ? 144 : 220;
  let y = A.heading(
    s,
    "Periksa email Anda",
    "Masukkan kode 6 digit yang dikirim ke"
  );
  A.text(s.b, "nadia@contoh.com", s.x, y - 24, s.w, 15, 600);
  y += 26;
  A.otp(s.b, s.x, y, s.w);
  A.text(
    s.b,
    "Kode berlaku selama 10 menit.",
    s.x,
    y + 108,
    s.w,
    13,
    400,
    A.C.muted
  );
  A.button(s.b, "Verifikasi email", s.x, y + 152, s.w, "disabled");
  A.link(s.b, "Kirim ulang dalam 00:48", s.x, y + 216, s.w);
  A.link(
    s.b,
    "Email salah? Ubah email",
    s.x,
    y + 264,
    s.w,
    s.prefix + "change-email"
  );
  A.footer(s, "Kembali ke masuk", "signin", y + 336);
};
A.render["verify-ready"] = (s) => {
  s.y = s.m ? 144 : 220;
  let y = A.heading(
    s,
    "Periksa email Anda",
    "Masukkan kode 6 digit yang dikirim ke"
  );
  A.text(s.b, "nadia@contoh.com", s.x, y - 24, s.w, 15, 600);
  y += 26;
  A.otp(s.b, s.x, y, s.w, { value: "482913", focus: false });
  A.text(
    s.b,
    "Kode berlaku selama 10 menit.",
    s.x,
    y + 108,
    s.w,
    13,
    400,
    A.C.muted
  );
  A.button(
    s.b,
    "Verifikasi email",
    s.x,
    y + 152,
    s.w,
    "aurora",
    s.prefix + "settings-unconnected"
  );
  A.link(s.b, "Kirim ulang kode", s.x, y + 216, s.w, s.prefix + "verify");
  A.link(
    s.b,
    "Email salah? Ubah email",
    s.x,
    y + 264,
    s.w,
    s.prefix + "change-email"
  );
  A.footer(s, "Kembali ke masuk", "signin", y + 336);
};
A.render.signin = (s) => {
  s.y = s.m ? 132 : 176;
  let y = A.heading(
    s,
    "Selamat datang kembali",
    "Masuk untuk melanjutkan percakapan Anda."
  );
  A.button(
    s.b,
    "Lanjutkan dengan Google",
    s.x,
    y,
    s.w,
    "google",
    s.prefix + "google-collision"
  );
  A.divider(s.b, s.x, y + 70, s.w, "atau dengan email");
  y += 104;
  A.field(s.b, "Email", "nadia@contoh.com", s.x, y, s.w);
  A.field(s.b, "Kata sandi", "••••••••••••", s.x, y + 96, s.w, {
    password: true,
  });
  A.link(s.b, "Lupa kata sandi?", s.x, y + 178, s.w, s.prefix + "forgot");
  A.button(s.b, "Masuk", s.x, y + 246, s.w, "aurora", s.prefix + "legacy");
  A.footer(s, "Belum punya akun? Buat akun", "signup", y + 322);
};
A.render.legacy = (s) => {
  s.y = s.m ? 132 : 192;
  let y = A.heading(
    s,
    "Verifikasi email Anda",
    "Satu langkah untuk melanjutkan ke akun Anda."
  );
  A.notice(
    s.b,
    "Data dan kalender Anda tetap tersimpan.\nVerifikasi email untuk membuka kembali akun.",
    s.x,
    y,
    s.w,
    { icon: "lock" }
  );
  y += 110;
  A.text(
    s.b,
    "Kode dikirim ke nadia@contoh.com",
    s.x,
    y,
    s.w,
    14,
    400,
    A.C.muted
  );
  A.otp(s.b, s.x, y + 40, s.w, { value: "482913", focus: false });
  A.button(
    s.b,
    "Verifikasi dan lanjutkan",
    s.x,
    y + 168,
    s.w,
    "aurora",
    s.prefix + "settings"
  );
  A.link(s.b, "Kirim ulang kode", s.x, y + 232, s.w, s.prefix + "legacy");
  A.link(
    s.b,
    "Tidak bisa mengakses email ini?",
    s.x,
    y + 280,
    s.w,
    s.prefix + "change-email"
  );
  A.footer(s, "Keluar dari akun", "signin", y + 352);
};
A.render["change-email"] = (s) => {
  s.y = s.m ? 132 : 164;
  let y = A.heading(
    s,
    "Ubah alamat email",
    "Konfirmasi akun Anda, lalu verifikasi email baru."
  );
  A.text(s.b, "Email saat ini", s.x, y, s.w, 13, 400, A.C.muted);
  A.text(s.b, "nadia@conoth.com", s.x, y + 24, s.w, 15, 600);
  A.field(s.b, "Kata sandi saat ini", "Masukkan kata sandi", s.x, y + 76, s.w, {
    password: true,
  });
  A.link(s.b, "Lupa kata sandi?", s.x, y + 154, s.w, s.prefix + "forgot");
  A.field(s.b, "Email baru", "nadia@contoh.com", s.x, y + 214, s.w);
  A.text(
    s.b,
    "Email lama diganti setelah email baru terverifikasi.",
    s.x,
    y + 306,
    s.w,
    13,
    400,
    A.C.muted
  );
  A.button(
    s.b,
    "Kirim kode ke email baru",
    s.x,
    y + 350,
    s.w,
    "aurora",
    s.prefix + "verify-email"
  );
  A.footer(s, "Kembali ke verifikasi", "verify", y + 426);
};
A.render["verify-email"] = (s) => {
  s.y = s.m ? 144 : 220;
  let y = A.heading(
    s,
    "Verifikasi email baru",
    "Masukkan kode 6 digit yang dikirim ke"
  );
  A.text(s.b, "nadia@contoh.com", s.x, y - 24, s.w, 15, 600);
  y += 26;
  A.otp(s.b, s.x, y, s.w, { value: "482913", focus: false });
  A.text(
    s.b,
    "Kode berlaku selama 10 menit.",
    s.x,
    y + 108,
    s.w,
    13,
    400,
    A.C.muted
  );
  A.button(
    s.b,
    "Verifikasi email baru",
    s.x,
    y + 152,
    s.w,
    "aurora",
    s.prefix + "email-updated"
  );
  A.link(s.b, "Kirim ulang kode", s.x, y + 216, s.w, s.prefix + "verify-email");
  A.link(
    s.b,
    "Ubah alamat email",
    s.x,
    y + 264,
    s.w,
    s.prefix + "change-email"
  );
};
A.render["email-updated"] = (s) => {
  s.y = s.m ? 168 : 254;
  let y = A.heading(
    s,
    "Email berhasil diubah",
    "Sekarang gunakan email ini untuk masuk."
  );
  A.notice(s.b, "nadia@contoh.com sudah terverifikasi.", s.x, y, s.w, {
    icon: "check",
  });
  A.text(
    s.b,
    "Data, pengaturan, dan koneksi kalender Anda\ntetap tersimpan di akun yang sama.",
    s.x,
    y + 88,
    s.w,
    15,
    400,
    A.C.muted
  );
  A.button(
    s.b,
    "Lanjutkan ke akun",
    s.x,
    y + 170,
    s.w,
    "aurora",
    s.prefix + "settings"
  );
};
A.render.forgot = (s) => {
  s.y = s.m ? 144 : 220;
  let y = A.heading(
    s,
    "Lupa kata sandi?",
    "Masukkan email yang Anda gunakan di Sydia."
  );
  A.field(s.b, "Email", "nadia@contoh.com", s.x, y, s.w);
  A.text(
    s.b,
    "Jika email terdaftar untuk login dengan kata sandi,\nkami akan mengirim kode untuk mengatur ulang.",
    s.x,
    y + 94,
    s.w,
    14,
    400,
    A.C.muted
  );
  A.button(
    s.b,
    "Kirim kode pemulihan",
    s.x,
    y + 174,
    s.w,
    "aurora",
    s.prefix + "reset-verify"
  );
  A.footer(s, "Kembali ke masuk", "signin", y + 250);
};
A.render["reset-verify"] = (s) => {
  s.y = s.m ? 144 : 220;
  let y = A.heading(
    s,
    "Periksa email Anda",
    "Masukkan kode pemulihan 6 digit untuk"
  );
  A.text(s.b, "nadia@contoh.com", s.x, y - 24, s.w, 15, 600);
  y += 26;
  A.otp(s.b, s.x, y, s.w, { value: "482913", focus: false });
  A.text(
    s.b,
    "Kode berlaku selama 10 menit.",
    s.x,
    y + 108,
    s.w,
    13,
    400,
    A.C.muted
  );
  A.button(
    s.b,
    "Lanjutkan",
    s.x,
    y + 152,
    s.w,
    "aurora",
    s.prefix + "reset-password"
  );
  A.link(s.b, "Kirim ulang kode", s.x, y + 216, s.w, s.prefix + "reset-verify");
  A.footer(s, "Kembali ke masuk", "signin", y + 288);
};
A.render["reset-password"] = (s) => {
  s.y = s.m ? 144 : 200;
  let y = A.heading(
    s,
    "Buat kata sandi baru",
    "Gunakan kata sandi yang belum pernah Anda pakai."
  );
  A.field(s.b, "Kata sandi baru", "Minimal 8 karakter", s.x, y, s.w, {
    password: true,
  });
  A.field(
    s.b,
    "Ulangi kata sandi baru",
    "Masukkan lagi kata sandi baru",
    s.x,
    y + 96,
    s.w,
    { password: true }
  );
  A.notice(
    s.b,
    "Setelah diubah, Anda akan keluar dari\nsemua perangkat dan perlu masuk lagi.",
    s.x,
    y + 202,
    s.w,
    { icon: "lock" }
  );
  A.button(
    s.b,
    "Simpan kata sandi baru",
    s.x,
    y + 316,
    s.w,
    "aurora",
    s.prefix + "reset-done"
  );
};
A.render["reset-done"] = (s) => {
  s.y = s.m ? 168 : 254;
  let y = A.heading(
    s,
    "Kata sandi diperbarui",
    "Silakan masuk menggunakan kata sandi baru."
  );
  A.notice(s.b, "Semua sesi sebelumnya telah diakhiri.", s.x, y, s.w, {
    icon: "check",
  });
  A.button(
    s.b,
    "Kembali ke masuk",
    s.x,
    y + 100,
    s.w,
    "aurora",
    s.prefix + "signin"
  );
};
A.render["google-collision"] = (s) => {
  s.y = s.m ? 132 : 180;
  let y = A.heading(
    s,
    "Akun Anda sudah ada",
    "Masuk dengan metode sebelumnya untuk\nmenghubungkan akun Google ini."
  );
  A.notice(s.b, "nadia@contoh.com", s.x, y, s.w, { icon: "user" });
  A.field(
    s.b,
    "Kata sandi Sydia",
    "Masukkan kata sandi Anda",
    s.x,
    y + 88,
    s.w,
    { password: true }
  );
  A.link(s.b, "Lupa kata sandi?", s.x, y + 168, s.w, s.prefix + "forgot");
  A.text(
    s.b,
    "Kami tidak akan membuat akun kedua atau\nmenggabungkan akun secara otomatis.",
    s.x,
    y + 230,
    s.w,
    14,
    400,
    A.C.muted
  );
  A.button(
    s.b,
    "Masuk dan lanjutkan",
    s.x,
    y + 312,
    s.w,
    "aurora",
    s.prefix + "link-google"
  );
  A.footer(s, "Gunakan akun Google lain", "signin", y + 388);
};
A.render["link-google"] = (s) => {
  s.y = s.m ? 144 : 200;
  let y = A.heading(
    s,
    "Hubungkan akun Google",
    "Tambahkan cara masuk ke akun Sydia Anda."
  );
  A.notice(s.b, "nadia@contoh.com", s.x, y, s.w, { icon: "user" });
  A.text(
    s.b,
    "Setelah terhubung, Anda bisa masuk dengan\nGoogle atau kata sandi. Data tetap di akun ini.",
    s.x,
    y + 88,
    s.w,
    15,
    400,
    A.C.muted
  );
  A.button(
    s.b,
    "Hubungkan akun Google",
    s.x,
    y + 166,
    s.w,
    "aurora",
    s.prefix + "settings"
  );
  A.link(s.b, "Nanti saja", s.x, y + 230, s.w, s.prefix + "settings");
};
A.render.settings = (s) => {
  const b = s.b;
  s.b.children.forEach((c) => c.remove());
  if (s.m) b.resize(390, 1100);
  const x = s.m ? 24 : 372,
    w = s.m ? 342 : 696;
  A.logoAt(b, s.m ? 24 : 40, s.m ? 26 : 36, 32, true);
  if (!s.m) {
    A.rect(b, "Sidebar rule", 247, 0, 1, 960, A.C.ink, 0, 0.08);
    A.text(b, "Pengaturan", 40, 144, 184, 20, 600);
    A.text(b, "Profil", 40, 204, 176, 14);
    A.rect(b, "Selected navigation", 24, 248, 200, 44, A.C.ink, 10, 0.05);
    A.text(b, "Akun & integrasi", 40, 260, 176, 14, 600);
    A.text(b, "Privasi", 40, 316, 176, 14);
    A.link(b, "Keluar dari akun", 40, 852, 176, "Dsignin");
  }
  let y = s.m ? 126 : 120;
  A.text(b, "Akun & integrasi", x, y, w, s.m ? 28 : 32, 700);
  y += 72;
  A.text(b, "Cara masuk", x, y, w, 20, 600);
  A.text(
    b,
    "nadia@contoh.com · Email terverifikasi",
    x,
    y + 38,
    w,
    14,
    400,
    A.C.muted
  );
  A.divider(b, x, y + 82, w);
  A.text(b, "Kata sandi", x, y + 106, w, 15, 600);
  A.text(b, "Aktif", x, y + 134, w, 13, 400, A.C.muted);
  A.link(
    b,
    "Ubah kata sandi",
    s.m ? x : x + w - 174,
    y + 158,
    s.m ? w : 174,
    s.prefix + "forgot"
  );
  A.divider(b, x, y + 222, w);
  A.google(b, x, y + 250);
  A.text(b, "Google", x + 34, y + 246, w - 34, 15, 600);
  A.text(b, "nadia@contoh.com", x, y + 284, w, 14, 400, A.C.muted);
  A.text(
    b,
    "Terhubung untuk masuk ke Sydia",
    x,
    y + 310,
    w,
    13,
    400,
    A.C.muted
  );
  y += 390;
  A.divider(b, x, y - 24, w);
  A.text(b, "Google Calendar", x, y, w, 20, 600);
  A.text(b, "nadia@kantor.com", x, y + 40, w, 15, 600);
  A.text(b, "Kalender aktif: Utama", x, y + 70, w, 14, 400, A.C.muted);
  A.text(
    b,
    "Sinkronisasi awal sedang berjalan.",
    x,
    y + 104,
    w,
    14,
    400,
    A.C.muted
  );
  A.text(
    b,
    "Akun kalender berbeda dari akun masuk Anda.",
    x,
    y + 144,
    w,
    13,
    400,
    A.C.muted
  );
  A.button(
    b,
    "Ganti akun kalender",
    x,
    y + 194,
    s.m ? w : 260,
    "outline",
    s.prefix + "settings-unconnected"
  );
  A.link(
    b,
    "Putuskan koneksi kalender",
    x,
    y + 258,
    w,
    s.prefix + "settings-unconnected"
  );
  if (s.m) A.link(b, "Keluar dari akun", x, y + 334, w, "Msignin");
};
A.keys = [
  "signup",
  "verify",
  "verify-ready",
  "signin",
  "legacy",
  "change-email",
  "verify-email",
  "email-updated",
  "forgot",
  "reset-verify",
  "reset-password",
  "reset-done",
  "google-collision",
  "link-google",
  "settings",
];
A.names = [
  "Daftar",
  "Verifikasi email · Menunggu",
  "Verifikasi email · Kode lengkap",
  "Masuk",
  "Akun lama · Wajib verifikasi",
  "Ubah email · Konfirmasi identitas",
  "Verifikasi email pengganti",
  "Email berhasil diubah",
  "Lupa kata sandi",
  "Kode pemulihan",
  "Kata sandi baru",
  "Pemulihan selesai",
  "Google · Akun sudah ada",
  "Google · Tautkan secara eksplisit",
  "Pengaturan · Akun & integrasi",
];
for (const device of ["desktop", "mobile"]) {
  const p = penpot.createPage();
  p.name =
    "Sydia · Account registration · " +
    (device === "mobile" ? "Mobile" : "Desktop");
  A.pages[device] = p;
  await penpot.openPage(p);
  const title = A.text(
    p.root,
    "Akun yang terverifikasi. Kalender atas pilihan Anda.",
    0,
    0,
    1600,
    36,
    700
  );
  A.text(
    p.root,
    "Registration enhancement · Bahasa Indonesia · " +
      (device === "mobile" ? "390 px mobile" : "1440 px desktop") +
      " · Example names and addresses are illustrative.",
    0,
    72,
    1800,
    16,
    400,
    A.C.muted
  );
  A.text(
    p.root,
    "Spec: ACCOUNT_REGISTRATION_AUTH_SPEC.md · Approved flows only. Google authorization is an external handoff; prototype links show the successful return.",
    0,
    116,
    1900,
    14,
    400,
    A.C.muted
  );
}
return {
  renderers: A.keys.length,
  pages: Object.fromEntries(Object.entries(A.pages).map(([k, p]) => [k, p.id])),
};
