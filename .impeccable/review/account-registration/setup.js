storage.auth = {
  version: "2026-10-19",
  C: {
    ink: "#171419",
    muted: "#6B6470",
    paper: "#FBF8F5",
    white: "#FFFFFF",
    brand: "#EF5A8A",
    error: "#DC2626",
  },
  font: penpot.fonts.findByName("Inter"),
  colors: penpot.library.local.colors,
  logo: penpot.library.local.components.find((c) => c.name === "Hairpin"),
  input: penpot.library.local.components.find((c) => c.name === "Input"),
  primary: penpot.library.local.components
    .find((c) => c.name === "Button")
    .mainInstance(),
  boards: {},
  actions: [],
  screens: [],
  pages: {},
};
const A = storage.auth;
A.fill = (color, opacity = 1) => {
  const c = A.colors.find((v) => v.color.toUpperCase() === color.toUpperCase());
  return [
    {
      fillColor: color,
      fillOpacity: opacity,
      ...(c ? { fillColorRefFile: c.libraryId, fillColorRefId: c.id } : {}),
    },
  ];
};
A.board = (parent, name, x, y, w, h, color = A.C.white) => {
  const b = penpot.createBoard();
  b.name = name;
  b.resize(w, h);
  b.x = x;
  b.y = y;
  b.fills = A.fill(color);
  b.clipContent = true;
  if (parent) parent.appendChild(b);
  return b;
};
A.rect = (p, name, x, y, w, h, color, r = 0, opacity = 1) => {
  const s = penpot.createRectangle();
  s.name = name;
  s.resize(w, h);
  s.x = p.x + x;
  s.y = p.y + y;
  s.borderRadius = r;
  s.fills = A.fill(color, opacity);
  p.appendChild(s);
  return s;
};
A.text = (
  p,
  text,
  x,
  y,
  w,
  size = 15,
  weight = 400,
  color = A.C.ink,
  h = 0
) => {
  const s = penpot.createText(text || "\u200B");
  if (!s) throw Error("Text creation failed: " + text);
  s.name = text.slice(0, 80) || "Empty digit";
  A.font.applyToText(
    s,
    A.font.variants.find(
      (v) => v.fontWeight === String(weight) && v.fontStyle === "normal"
    )
  );
  s.fontSize = String(size);
  s.lineHeight = "1.45";
  s.fills = A.fill(color);
  s.resize(w, h || Math.ceil(size * 1.45 * (text.split("\n").length + 1)));
  s.growType = "auto-height";
  s.x = p.x + x;
  s.y = p.y + y;
  p.appendChild(s);
  return s;
};
A.icon = (p, name, x, y, size = 20, color = A.C.muted) => {
  const paths = {
    back: '<path d="m15 18-6-6 6-6M9 12h12"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    calendar:
      '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18m-11 5h4"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 3h.01"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    link: '<path d="m10 13 4-4m-6 8-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 0 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
    refresh:
      '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
  };
  const g = penpot.createShapeFromSvg(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="' +
      color +
      '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      paths[name] +
      "</svg>"
  );
  if (!g) throw Error("Icon unavailable " + name);
  g.name = "Icon / " + name;
  g.resize(size, size);
  g.x = p.x + x;
  g.y = p.y + y;
  p.appendChild(g);
  return g;
};
A.logoAt = (p, x, y, size = 32, label = true) => {
  const s = A.logo.instance();
  s.resize(size, size);
  s.x = p.x + x;
  s.y = p.y + y;
  p.appendChild(s);
  if (label) A.text(p, "Sydia", x + size + 10, y + 1, 120, 23, 700);
  return s;
};
A.google = (p, x, y) => {
  const g = penpot.createShapeFromSvg(
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 48 48"><path fill="#4285F4" d="M43.6 24.5c0-1.5-.1-3-.4-4.5H24v8.5h11a9.4 9.4 0 0 1-4.1 6.2v5.2h6.7c3.9-3.6 6-8.9 6-15.4Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-5l-6.7-5.2c-1.8 1.2-4.1 2-6.8 2-5.3 0-9.8-3.6-11.4-8.4H5.7v5.4A20.4 20.4 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.6 27.4a12.3 12.3 0 0 1 0-7.8v-5.4H5.7a20.4 20.4 0 0 0 0 18.6l6.9-5.4Z"/><path fill="#EA4335" d="M24 11.2c3 0 5.7 1 7.8 3l5.8-5.7A19.6 19.6 0 0 0 24 3 20.4 20.4 0 0 0 5.7 14.2l6.9 5.4A12 12 0 0 1 24 11.2Z"/></svg>'
  );
  if (!g) throw Error("Google mark failed");
  g.name = "Google / official multicolor G";
  g.resize(20, 20);
  g.x = p.x + x;
  g.y = p.y + y;
  p.appendChild(g);
  return g;
};
A.button = (p, label, x, y, w, kind = "primary", target = null) => {
  const b = A.board(
    p,
    "Button / " + label,
    p.x + x,
    p.y + y,
    w,
    48,
    kind === "primary" ? A.C.ink : A.C.white
  );
  b.borderRadius = 10;
  if (kind === "aurora") {
    b.fills = A.primary.fills;
    A.rect(b, "Contrast wash", 0, 0, w, 48, A.C.white, 10, 0.3);
  }
  if (kind === "outline" || kind === "google")
    b.strokes = [
      {
        strokeColor: A.C.ink,
        strokeOpacity: 0.16,
        strokeWidth: 1,
        strokeAlignment: "inner",
      },
    ];
  if (kind === "disabled") {
    b.fills = A.fill(A.C.ink, 0.06);
  }
  if (kind === "google") A.google(b, 18, 14);
  const t = A.text(
    b,
    label,
    kind === "google" ? 48 : 12,
    12,
    w - (kind === "google" ? 64 : 24),
    15,
    600,
    kind === "primary" || kind === "aurora"
      ? A.C.white
      : kind === "disabled"
        ? A.C.muted
        : A.C.ink
  );
  t.align = "center";
  if (target) A.actions.push({ shape: b, target });
  return b;
};
A.link = (p, label, x, y, w, target = null) => {
  const b = A.board(p, "Link / " + label, p.x + x, p.y + y, w, 44, A.C.paper);
  b.fills = [];
  const t = A.text(b, label, 0, 10, w, 14, 600);
  t.textDecoration = "underline";
  if (target) A.actions.push({ shape: b, target });
  return b;
};
A.field = (
  p,
  label,
  value,
  x,
  y,
  w,
  { password = false, error = false, focus = false } = {}
) => {
  A.text(p, label, x, y, w, 14, 600);
  const b = A.input.instance();
  b.name = "Field / " + label;
  b.resize(w, 48);
  b.x = p.x + x;
  b.y = p.y + y + 28;
  p.appendChild(b);
  if (b.flex) b.flex.remove();
  b.strokes = [
    {
      strokeColor: error ? A.C.error : focus ? A.C.brand : A.C.ink,
      strokeOpacity: error || focus ? 1 : 0.16,
      strokeWidth: focus ? 2 : 1,
      strokeAlignment: "inner",
    },
  ];
  b.borderRadius = 10;
  const t = penpotUtils.findShape((s) => s.type === "text", b);
  t.characters = value;
  t.resize(w - (password ? 60 : 28), 24);
  t.growType = "auto-height";
  t.fontSize = "15";
  t.fills = A.fill(value ? A.C.ink : A.C.muted);
  t.x = b.x + 14;
  t.y = b.y + 13;
  if (password) A.icon(p, "eye", x + w - 36, y + 42, 20);
  return b;
};
A.notice = (p, message, x, y, w, { error = false, icon = "alert" } = {}) => {
  const lines = message.split("\n").length;
  const h = lines > 1 ? 82 : 60;
  const b = A.board(
    p,
    "Feedback / " + message.slice(0, 45),
    p.x + x,
    p.y + y,
    w,
    h,
    A.C.white
  );
  b.borderRadius = 10;
  b.fills = A.fill(error ? A.C.error : A.C.ink, error ? 0.055 : 0.045);
  A.icon(b, icon, 14, 17, 20, error ? A.C.error : A.C.muted);
  A.text(b, message, 46, 14, w - 62, 14, 400, error ? A.C.error : A.C.ink);
  return h;
};
A.otp = (
  p,
  x,
  y,
  w,
  { value = "", error = false, focus = true, disabled = false } = {}
) => {
  A.text(p, "Kode verifikasi", x, y, w, 14, 600);
  const gap = 8;
  const cell = (w - gap * 5) / 6;
  for (let i = 0; i < 6; i++) {
    const b = A.board(
      p,
      "OTP digit " + (i + 1),
      p.x + x + i * (cell + gap),
      p.y + y + 30,
      cell,
      60,
      A.C.white
    );
    b.borderRadius = 10;
    b.strokes = [
      {
        strokeColor: error
          ? A.C.error
          : focus && i === value.length
            ? A.C.brand
            : A.C.ink,
        strokeOpacity: error || (focus && i === value.length) ? 1 : 0.16,
        strokeWidth: focus && i === value.length ? 2 : 1,
        strokeAlignment: "inner",
      },
    ];
    if (disabled) b.opacity = 0.45;
    const t = A.text(b, value[i] || "", 0, 12, cell, 24, 600);
    t.align = "center";
    if (focus && i === value.length && !value[i])
      A.rect(b, "Insertion caret", cell / 2, 18, 2, 24, A.C.ink);
  }
  return 90;
};
A.divider = (p, x, y, w, label) => {
  A.rect(p, "Divider", x, y + 10, w, 1, A.C.ink, 0, 0.08);
  if (label) {
    const b = A.rect(
      p,
      "Divider label backing",
      x + w / 2 - 73,
      y - 1,
      146,
      24,
      A.C.paper
    );
    const t = A.text(p, label, x + w / 2 - 68, y, 136, 13, 400, A.C.muted);
    t.align = "center";
  }
};
A.shell = (key, name, mobile, index) => {
  const w = mobile ? 390 : 1440,
    h = mobile ? 844 : 960;
  const cols = mobile ? 5 : 4;
  const x = (index % cols) * (w + 100),
    y = 220 + Math.floor(index / cols) * (h + 140);
  const b = A.board(
    null,
    name + (mobile ? " · Mobile" : " · Desktop"),
    x,
    y,
    w,
    h,
    A.C.paper
  );
  b.setPluginData("authScreen", key);
  b.setPluginData("spec", "docs/ACCOUNT_REGISTRATION_AUTH_SPEC.md");
  const rootKey = (mobile ? "M" : "D") + key;
  A.boards[rootKey] = b;
  A.screens.push({
    key: rootKey,
    id: b.id,
    name: b.name,
    pageId: penpot.currentPage.id,
    width: w,
    height: h,
  });
  const split = !mobile && ["signup", "signin"].includes(key);
  if (mobile) {
    A.logoAt(b, 24, 26, 30, true);
  } else if (!split) {
    A.logoAt(b, 496, 48, 32, true);
  } else {
    A.rect(b, "Incumbent brand panel", 0, 0, 590, h, A.C.white);
    A.rect(b, "Panel divider", 589, 0, 1, h, A.C.ink, 0, 0.08);
    A.logoAt(b, 64, 48, 36, true);
    A.text(
      b,
      "Ngobrol seperti biasa,\ntanpa instruksi rumit",
      64,
      276,
      455,
      44,
      700
    );
    A.text(
      b,
      "Sampaikan melalui chat,\nSydia yang urus sisanya.",
      64,
      430,
      430,
      17,
      400,
      A.C.muted
    );
    const chat = A.board(
      b,
      "Illustrative conversation",
      b.x + 88,
      b.y + 542,
      438,
      74,
      A.C.paper
    );
    chat.borderRadius = 16;
    A.text(
      chat,
      "Ingatkan aku bayar listrik\nJumat jam 9 pagi.",
      18,
      14,
      400,
      15,
      400
    );
    A.logoAt(b, 64, 647, 28, false);
    const reply = A.board(
      b,
      "Sydia example reply",
      b.x + 106,
      b.y + 637,
      420,
      100,
      A.C.paper
    );
    reply.borderRadius = 16;
    A.text(
      reply,
      "Siap, pengingat bayar listrik untuk\nJumat pukul 09.00 sudah dibuat.",
      18,
      19,
      384,
      15,
      400
    );
    A.text(
      b,
      "Asisten pribadi untuk keseharian Anda.",
      64,
      876,
      455,
      13,
      400,
      A.C.muted
    );
  }
  return {
    b,
    x: mobile ? 24 : split ? 792 : 496,
    y: mobile ? 132 : 144,
    w: mobile ? 342 : 448,
    m: mobile,
    prefix: mobile ? "M" : "D",
    key,
  };
};
A.heading = (s, title, desc) => {
  A.text(s.b, title, s.x, s.y, s.w, s.m ? 30 : 38, 700);
  const lines = title.split("\n").length;
  const dy = lines * (s.m ? 43 : 54);
  if (desc) A.text(s.b, desc, s.x, s.y + dy + 8, s.w, 15, 400, A.C.muted);
  return s.y + dy + 8 + (desc ? desc.split("\n").length * 22 + 28 : 20);
};
A.footer = (s, label, target, y) => {
  A.divider(s.b, s.x, y, s.w);
  A.link(s.b, label, s.x, y + 16, s.w, s.prefix + target);
};
return { ready: true };
