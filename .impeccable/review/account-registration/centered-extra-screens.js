const A = storage.auth;
A.render["change-email-google"] = (s) => {
  s.y = 180;
  let y = A.heading(
    s,
    "Konfirmasi akun Anda",
    "Gunakan akun Google yang sudah terhubung."
  );
  A.notice(s.b, "Akun terhubung: nadia@contoh.com", s.x, y, s.w, {
    icon: "user",
  });
  A.button(
    s.b,
    "Konfirmasi dengan Google",
    s.x,
    y + 88,
    s.w,
    "google",
    "Dchange-email-after-google"
  );
  A.text(
    s.b,
    "Setelah konfirmasi, Anda dapat mengisi email baru.\nEmail lama tetap dipakai hingga verifikasi selesai.",
    s.x,
    y + 166,
    s.w,
    14,
    400,
    A.C.muted
  );
  A.footer(s, "Kembali ke verifikasi", "legacy", y + 264);
};
A.render["change-email-after-google"] = (s) => {
  s.y = 180;
  let y = A.heading(
    s,
    "Masukkan email baru",
    "Identitas Anda sudah dikonfirmasi dengan Google."
  );
  A.field(s.b, "Email baru", "nadia@contoh.com", s.x, y, s.w);
  A.text(
    s.b,
    "Email lama diganti setelah email baru terverifikasi.",
    s.x,
    y + 100,
    s.w,
    14,
    400,
    A.C.muted
  );
  A.button(
    s.b,
    "Kirim kode ke email baru",
    s.x,
    y + 176,
    s.w,
    "aurora",
    "Dverify-email"
  );
  A.footer(s, "Kembali ke verifikasi", "legacy", y + 254);
};
A.render["settings-unconnected"] = (s) => {
  const b = s.b,
    x = 440,
    w = 560,
    y = 132;
  A.text(b, "Akun & integrasi", x, y, w, 32, 700);
  A.text(
    b,
    "nadia@contoh.com · Email terverifikasi",
    x,
    y + 60,
    w,
    14,
    400,
    A.C.muted
  );
  A.divider(b, x, y + 110, w);
  A.text(b, "Cara masuk", x, y + 140, w, 20, 600);
  A.text(b, "Email dan kata sandi", x, y + 184, w, 15, 600);
  A.text(
    b,
    "Google belum terhubung untuk masuk.",
    x,
    y + 220,
    w,
    14,
    400,
    A.C.muted
  );
  A.button(
    b,
    "Hubungkan akun Google",
    x,
    y + 266,
    w,
    "outline",
    "Dlink-google"
  );
  A.divider(b, x, y + 350, w);
  A.text(b, "Google Calendar", x, y + 382, w, 20, 600);
  A.text(b, "Belum terhubung", x, y + 424, w, 15, 600);
  A.text(
    b,
    "Hubungkan kalender kapan saja.\nAnda tetap dapat menggunakan Sydia.",
    x,
    y + 460,
    w,
    14,
    400,
    A.C.muted
  );
  A.button(b, "Hubungkan Google Calendar", x, y + 544, w, "aurora");
};
A.render.settings = (s) => {
  const b = s.b,
    x = 440,
    w = 560;
  let y = 132;
  A.text(b, "Akun & integrasi", x, y, w, 32, 700);
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
  A.link(b, "Ubah kata sandi", x, y + 158, w, "Dforgot");
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
  A.button(b, "Ganti akun kalender", x, y + 194, w, "outline");
  A.link(
    b,
    "Putuskan koneksi kalender",
    x,
    y + 258,
    w,
    "Dsettings-unconnected"
  );
};
return ["change-email-google", "change-email-after-google"].map(A.rebuild);
