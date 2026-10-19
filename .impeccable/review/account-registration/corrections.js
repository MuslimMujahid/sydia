const A = storage.auth;
A.logoImage = penpotUtils.findShape(
  (s) => s.name === "Exact SVG rendering" && s.fills?.some((f) => f.fillImage),
  A.logo.mainInstance()
);
if (!A.logoImage) throw Error("Existing exact logo image missing");
A.logoAt = (p, x, y, size = 32, label = true) => {
  const s = A.rect(p, "Sydia / exact brand mark", x, y, size, size, A.C.white);
  s.fills = A.logoImage.fills;
  if (label) A.text(p, "Sydia", x + size + 10, y + 1, 120, 23, 700);
  return s;
};
for (const b of Object.values(A.boards)) {
  const logos = penpotUtils.findShapes(
    (s) => s.name === "Sydia / Brand / Hairpin",
    b
  );
  for (const logo of logos) {
    const x = logo.x - b.x,
      y = logo.y - b.y,
      size = logo.width;
    logo.remove();
    A.logoAt(b, x, y, size, false);
  }
}
A.render.signup = (s) => {
  if (s.m) {
    s.b.resize(390, 1060);
    A.screens.find((v) => v.id === s.b.id).height = 1060;
  }
  s.y = s.m ? 132 : 80;
  let y = A.heading(
    s,
    "Buat akun Sydia",
    "Catat tugas dan buat pengingat lewat chat."
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
  A.field(
    s.b,
    "Konfirmasi kata sandi",
    "Ulangi kata sandi Anda",
    s.x,
    y + 288,
    s.w,
    { password: true }
  );
  A.text(
    s.b,
    "Email Anda akan diverifikasi sebelum melanjutkan.",
    s.x,
    y + 380,
    s.w,
    13,
    400,
    A.C.muted
  );
  A.button(s.b, "Buat akun", s.x, y + 424, s.w, "aurora", s.prefix + "verify");
  A.footer(s, "Sudah punya akun? Masuk", "signin", y + 500);
};
for (const [key, mobile] of [
  ["Msignup", true],
  ["Dsignup", false],
]) {
  const b = A.boards[key];
  const keep = mobile ? [] : b.children.slice(0, 12);
  A.actions = A.actions.filter(
    (a) => !penpotUtils.findShapes((s) => s.id === a.shape.id, b).length
  );
  b.children
    .filter((s) => mobile || s.x >= b.x + 590)
    .forEach((s) => s.remove());
  if (mobile) A.logoAt(b, 24, 26, 30);
  A.render.signup({
    b,
    x: mobile ? 24 : 792,
    y: mobile ? 132 : 80,
    w: mobile ? 342 : 448,
    m: mobile,
    prefix: mobile ? "M" : "D",
    key: "signup",
  });
}
return { corrected: "All logo artwork and both signup forms" };
