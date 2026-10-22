const A = storage.auth;
A.profileStage = (target, stage) => {
  const b = penpotUtils.findShapeById(A.profileTargets[target]);
  if (!b) throw Error("Missing " + target);
  const m = target.startsWith("M"),
    linked = target.endsWith("linked") && !target.endsWith("unlinked"),
    prefix = m ? "M" : "D";
  const x = m ? 20 : 576,
    w = m ? 350 : 768,
    p = m ? 24 : 32,
    inner = w - p * 2,
    top = m ? 148 : 120,
    formH = m ? 586 : 554,
    authY = top + formH + 28;
  const form = () => b.children.find((s) => s.name === "Existing profile form");
  const auth = () =>
    b.children.find((s) => s.name === "Profile addition / Cara masuk");
  const text = (
    parent,
    t,
    px,
    py,
    width,
    size = 14,
    weight = 400,
    color = A.C.ink
  ) => A.text(parent, t, px, py, width, size, weight, color);
  if (stage === 0) {
    for (const s of b.children) s.remove();
    b.resize(m ? 390 : 1440, m ? 1500 : 1100);
    b.name =
      "/settings/profile · Google " +
      (linked ? "terhubung" : "belum terhubung") +
      (m ? " · Mobile" : " · Desktop");
    b.setPluginData("route", "/settings/profile");
    b.setPluginData("authLayout", "existing-settings-layout");
    b.setPluginData(
      "scope",
      "Existing Profile form plus sign-in methods. Existing SettingsNav and dashboard shell retained. Calendar remains at /settings/integrations."
    );
  }
  if (stage === 1) {
    if (m) {
      A.rect(b, "Existing mobile app bar", 0, 0, 390, 64, A.C.white);
      A.rect(b, "App bar separator", 0, 63, 390, 1, A.C.ink, 0, 0.08);
      const menu = penpot.createShapeFromSvg(
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#171419" stroke-width="1.7" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>'
      );
      if (!menu) throw Error("Menu icon missing");
      menu.x = b.x + 20;
      menu.y = b.y + 20;
      b.appendChild(menu);
      text(b, "Profil", 60, 20, 240, 17, 600);
      A.icon(b, "user", 346, 20, 24);
    } else {
      A.rect(b, "Existing dashboard sidebar", 0, 0, 272, 1100, A.C.white);
      A.rect(b, "Sidebar separator", 271, 0, 1, 1100, A.C.ink, 0, 0.08);
      A.logoAt(b, 24, 20, 24);
      A.divider(b, 16, 1008, 240);
      A.icon(b, "user", 24, 1043, 24);
      text(b, "Nadia Putri", 62, 1034, 180, 14, 600);
      text(b, "nadia@contoh.com", 62, 1058, 180, 12, 400, A.C.muted);
    }
  }
  if (stage === 2 && !m) {
    const labels = ["Chat baru", "Kalender", "Catatan", "File", "Lainnya"];
    labels.forEach((label, i) =>
      text(b, label, 54, 88 + i * 44, 188, 14, 400, A.C.muted)
    );
    text(b, "Percakapan", 24, 352, 220, 12, 600, A.C.muted);
    text(b, "Rencana minggu ini", 24, 392, 220, 14, 400, A.C.muted);
    text(b, "Catatan rapat", 24, 432, 220, 14, 400, A.C.muted);
  }
  if (stage === 3) {
    const labels = ["Profil", "Asisten", "Notifikasi", "Integrasi"],
      routes = [
        "/settings/profile",
        "/settings/assistant",
        "/settings/notifications",
        "/settings/integrations",
      ];
    labels.forEach((label, i) => {
      const nx = m ? [20, 100, 190, 292][i] : 320,
        ny = m ? 84 : 48 + i * 48,
        nw = m ? [70, 80, 92, 78][i] : 208;
      if (i === 0)
        A.rect(
          b,
          "Existing active settings " + (m ? "tab" : "item"),
          nx,
          ny,
          nw,
          40,
          A.C.ink,
          10,
          0.06
        );
      text(
        b,
        label,
        nx + 12,
        ny + 11,
        nw - 20,
        m ? 13 : 14,
        600,
        i === 0 ? A.C.ink : A.C.muted
      ).setPluginData("route", routes[i]);
    });
    if (!m) text(b, "Profil", x, 48, w, 26, 600);
  }
  if (stage === 4) {
    const c = A.board(
      b,
      "Existing profile form",
      b.x + x,
      b.y + top,
      w,
      formH,
      A.C.white
    );
    c.borderRadius = 16;
    A.field(c, "Nama", "Nadia Putri", p, 28, inner);
    const email = A.field(c, "Email", "nadia@contoh.com", p, 128, inner);
    email.fills = A.fill(A.C.ink, 0.04);
    email.setPluginData("state", "disabled; existing profile email field");
    text(c, "Email terverifikasi", p, 210, inner, 13, 400, A.C.muted);
    A.link(c, "Ubah email", p + inner - 100, 198, 100, prefix + "change-email");
  }
  if (stage === 5) {
    const c = form();
    if (!c) throw Error("Profile form missing");
    A.field(c, "Zona waktu", "Asia/Makassar", p, 252, inner);
    A.icon(c, "chevron", p + inner - 32, 294, 16);
    text(
      c,
      m
        ? "Untuk waktu relatif dan penjadwalan."
        : "Digunakan untuk memahami waktu relatif dan menjadwalkan tindakan berikutnya.",
      p,
      334,
      inner,
      12,
      400,
      A.C.muted
    );
    A.field(c, "Bahasa", "Bahasa Indonesia", p, 378, inner);
    A.icon(c, "chevron", p + inner - 32, 420, 16);
    A.button(
      c,
      "Simpan perubahan",
      p,
      m ? 500 : 482,
      m ? inner : 204,
      "aurora"
    );
  }
  if (stage === 6) {
    const c = A.board(
      b,
      "Profile addition / Cara masuk",
      b.x + x,
      b.y + authY,
      w,
      m ? 416 : 302,
      A.C.white
    );
    c.borderRadius = 16;
    text(c, "Cara masuk", p, 26, inner, 17, 600);
    text(
      c,
      "Kelola metode masuk ke akun Sydia Anda.",
      p,
      60,
      inner,
      14,
      400,
      A.C.muted
    );
    A.divider(c, p, 104, inner);
    text(c, "Kata sandi", p, 130, inner, 15, 600);
    A.link(c, "Ubah kata sandi", p, 158, inner, prefix + "forgot");
    A.divider(c, p, m ? 218 : 208, inner);
  }
  if (stage === 7) {
    const c = auth();
    if (!c) throw Error("Sign-in section missing");
    A.google(c, p, m ? 248 : 238);
    text(c, "Google", p + 32, m ? 244 : 234, inner - 32, 15, 600);
    if (linked) {
      text(
        c,
        "nadia@contoh.com",
        p + 32,
        m ? 276 : 266,
        inner - 32,
        14,
        400,
        A.C.muted
      );
      if (m)
        text(
          c,
          "Terhubung untuk masuk ke Sydia.",
          p,
          322,
          inner,
          13,
          400,
          A.C.muted
        );
    } else if (m) {
      text(
        c,
        "Belum terhubung untuk masuk.",
        p,
        284,
        inner,
        13,
        400,
        A.C.muted
      );
      A.button(
        c,
        "Hubungkan Google",
        p,
        336,
        inner,
        "outline",
        prefix + "link-google"
      );
    } else {
      A.button(
        c,
        "Hubungkan Google",
        w - p - 184,
        230,
        184,
        "outline",
        prefix + "link-google"
      );
    }
    text(
      b,
      "Google Calendar dikelola di Integrasi.",
      x,
      authY + c.height + 24,
      w,
      13,
      400,
      A.C.muted
    ).setPluginData("route", "/settings/integrations");
  }
  b.setPluginData("profileStage", String(stage));
  return { target, stage, children: b.children.length, name: b.name };
};
return { ready: true };
