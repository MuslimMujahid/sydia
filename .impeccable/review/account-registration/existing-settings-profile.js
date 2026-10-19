const A = storage.auth;
A.existingSettingsProfile = (b, mobile, linked) => {
  const prior = b.children.map((s) => s.id);
  const descendants = new Set(
    penpotUtils.findShapes(() => true, b).map((s) => s.id)
  );
  A.actions = A.actions.filter((a) => !descendants.has(a.shape.id));
  for (const id of prior) {
    const s = penpotUtils.findShapeById(id);
    if (s) s.remove();
  }
  b.resize(mobile ? 390 : 1440, mobile ? 1500 : 1100);
  b.name =
    "/settings/profile · Google " +
    (linked ? "terhubung" : "belum terhubung") +
    (mobile ? " · Mobile" : " · Desktop");
  b.setPluginData("route", "/settings/profile");
  b.setPluginData("authLayout", "existing-settings-layout");
  b.setPluginData(
    "scope",
    "Extend existing Profile page with sign-in methods; keep existing global shell and SettingsNav. Calendar remains at /settings/integrations."
  );
  const prefix = mobile ? "M" : "D";
  if (!mobile) {
    A.rect(b, "Existing dashboard sidebar", 0, 0, 272, 1100, A.C.white);
    A.rect(b, "Sidebar separator", 271, 0, 1, 1100, A.C.ink, 0, 0.08);
    A.logoAt(b, 24, 20, 24, true);
    const labels = ["Chat baru", "Kalender", "Catatan", "File", "Lainnya"];
    const icons = ["mail", "calendar", "link", "mail", "chevron"];
    labels.forEach((label, i) => {
      A.icon(b, icons[i], 24, 90 + i * 44, 18);
      A.text(b, label, 54, 88 + i * 44, 188, 14, 400, A.C.muted);
    });
    A.text(b, "Percakapan", 24, 352, 220, 12, 600, A.C.muted);
    A.text(b, "Rencana minggu ini", 24, 392, 220, 14, 400, A.C.muted);
    A.text(b, "Catatan rapat", 24, 432, 220, 14, 400, A.C.muted);
    A.divider(b, 16, 1008, 240);
    A.icon(b, "user", 24, 1043, 24);
    A.text(b, "Nadia Putri", 62, 1034, 180, 14, 600);
    A.text(b, "nadia@contoh.com", 62, 1058, 180, 12, 400, A.C.muted);
    const nav = ["Profil", "Asisten", "Notifikasi", "Integrasi"];
    const navIcons = ["user", "check", "alert", "link"];
    nav.forEach((label, i) => {
      if (i === 0)
        A.rect(
          b,
          "Existing active settings item",
          320,
          48 + i * 48,
          208,
          40,
          A.C.ink,
          10,
          0.06
        );
      A.icon(
        b,
        navIcons[i],
        332,
        59 + i * 48,
        16,
        i === 0 ? A.C.brand : A.C.muted
      );
      const t = A.text(
        b,
        label,
        358,
        56 + i * 48,
        156,
        14,
        600,
        i === 0 ? A.C.ink : A.C.muted
      );
      t.setPluginData(
        "route",
        [
          "/settings/profile",
          "/settings/assistant",
          "/settings/notifications",
          "/settings/integrations",
        ][i]
      );
    });
  } else {
    A.rect(b, "Existing mobile app bar", 0, 0, 390, 64, A.C.white);
    A.rect(b, "App bar divider", 0, 63, 390, 1, A.C.ink, 0, 0.08);
    const menu = penpot.createShapeFromSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#171419" stroke-width="1.7" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>'
    );
    if (!menu) throw Error("Menu icon failed");
    menu.name = "Existing app navigation trigger";
    menu.x = b.x + 20;
    menu.y = b.y + 20;
    b.appendChild(menu);
    A.text(b, "Profil", 60, 20, 240, 17, 600);
    A.icon(b, "user", 346, 20, 24);
    const nav = ["Profil", "Asisten", "Notifikasi", "Integrasi"];
    const starts = [20, 100, 190, 292],
      widths = [70, 80, 92, 78];
    nav.forEach((label, i) => {
      if (i === 0)
        A.rect(
          b,
          "Existing active settings tab",
          starts[i],
          84,
          widths[i],
          40,
          A.C.ink,
          10,
          0.06
        );
      const t = A.text(
        b,
        label,
        starts[i] + 10,
        95,
        widths[i] - 16,
        13,
        600,
        i === 0 ? A.C.ink : A.C.muted
      );
      t.setPluginData(
        "route",
        [
          "/settings/profile",
          "/settings/assistant",
          "/settings/notifications",
          "/settings/integrations",
        ][i]
      );
    });
  }
  const x = mobile ? 20 : 576,
    w = mobile ? 350 : 768,
    px = mobile ? 24 : 32,
    inner = w - px * 2;
  if (!mobile) A.text(b, "Profil", x, 48, w, 26, 600);
  const top = mobile ? 148 : 120;
  const card = A.board(
    b,
    "Existing profile form",
    b.x + x,
    b.y + top,
    w,
    mobile ? 586 : 554,
    A.C.white
  );
  card.borderRadius = 16;
  A.field(card, "Nama", "Nadia Putri", px, 28, inner);
  const email = A.field(card, "Email", "nadia@contoh.com", px, 128, inner);
  email.fills = A.fill(A.C.ink, 0.04);
  email.setPluginData("state", "disabled; existing profile email field");
  A.text(card, "Email terverifikasi", px, 210, inner, 13, 400, A.C.muted);
  A.link(
    card,
    "Ubah email",
    px + inner - 100,
    198,
    100,
    prefix + "change-email"
  );
  A.field(card, "Zona waktu", "Asia/Makassar", px, 252, inner);
  A.icon(card, "chevron", px + inner - 32, 294, 16);
  A.text(
    card,
    mobile
      ? "Untuk waktu relatif dan penjadwalan."
      : "Digunakan untuk memahami waktu relatif dan menjadwalkan tindakan berikutnya.",
    px,
    334,
    inner,
    12,
    400,
    A.C.muted
  );
  A.field(card, "Bahasa", "Bahasa Indonesia", px, 378, inner);
  A.icon(card, "chevron", px + inner - 32, 420, 16);
  A.button(
    card,
    "Simpan perubahan",
    px,
    mobile ? 500 : 482,
    mobile ? inner : 204,
    "aurora"
  );
  const at = top + card.height + 28;
  const auth = A.board(
    b,
    "Profile addition / Cara masuk",
    b.x + x,
    b.y + at,
    w,
    mobile ? 416 : 302,
    A.C.white
  );
  auth.borderRadius = 16;
  A.text(auth, "Cara masuk", px, 26, inner, 17, 600);
  A.text(
    auth,
    "Kelola metode masuk ke akun Sydia Anda.",
    px,
    60,
    inner,
    14,
    400,
    A.C.muted
  );
  A.divider(auth, px, 104, inner);
  A.text(auth, "Kata sandi", px, 130, inner, 15, 600);
  A.link(
    auth,
    "Ubah kata sandi",
    px,
    mobile ? 162 : 158,
    inner,
    prefix + "forgot"
  );
  A.divider(auth, px, mobile ? 218 : 208, inner);
  A.google(auth, px, mobile ? 248 : 238);
  A.text(auth, "Google", px + 32, mobile ? 244 : 234, inner - 32, 15, 600);
  if (linked) {
    A.text(
      auth,
      "nadia@contoh.com",
      px + 32,
      mobile ? 276 : 266,
      inner - 32,
      14,
      400,
      A.C.muted
    );
    if (mobile)
      A.text(
        auth,
        "Terhubung untuk masuk ke Sydia.",
        px,
        322,
        inner,
        13,
        400,
        A.C.muted
      );
  } else {
    if (mobile) {
      A.text(
        auth,
        "Belum terhubung untuk masuk.",
        px,
        284,
        inner,
        13,
        400,
        A.C.muted
      );
      A.button(
        auth,
        "Hubungkan Google",
        px,
        336,
        inner,
        "outline",
        prefix + "link-google"
      );
    } else {
      A.button(
        auth,
        "Hubungkan Google",
        w - px - 184,
        230,
        184,
        "outline",
        prefix + "link-google"
      );
    }
  }
  A.text(
    b,
    "Google Calendar dikelola di Integrasi.",
    x,
    at + auth.height + 24,
    w,
    13,
    400,
    A.C.muted
  ).setPluginData("route", "/settings/integrations");
  return {
    id: b.id,
    name: b.name,
    height: b.height,
    route: b.getPluginData("route"),
  };
};
return { ready: true };
