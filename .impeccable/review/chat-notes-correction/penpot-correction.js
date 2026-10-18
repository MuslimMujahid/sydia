if (penpot.currentFile.id !== "4a7e6716-c5b5-8080-8008-c936c7a3dabc")
  throw new Error("The connected file is not the requested Sydia file");
if (!storage.screens || !storage.u)
  throw new Error("Existing Chat Notes design references are unavailable");
await penpot.openPage(storage.designPage);
const u = storage.u,
  C = storage.C,
  screens = storage.screens;
const exactFont = penpot.fonts.all.find((f) => f.name === "Inter");
if (!exactFont) throw new Error("Inter is unavailable");
storage.inter = exactFont;
storage.liveUI = {
  main: { h: 960, w: 1168, x: 272, y: 0 },
  navIcons: [
    {
      name: "Chat baru",
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-square-plus size-4 shrink-0" aria-hidden="true"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"></path><path d="M12 8v6"></path><path d="M9 11h6"></path></svg>',
    },
    {
      name: "Kalender",
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar-days size-4 shrink-0" aria-hidden="true"><path d="M8 2v3"></path><path d="M16 2v3"></path><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M3 9h18"></path><path d="M8 13h.01"></path><path d="M12 13h.01"></path><path d="M16 13h.01"></path><path d="M8 17h.01"></path><path d="M12 17h.01"></path><path d="M16 17h.01"></path></svg>',
    },
    {
      name: "Catatan",
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-notebook-pen size-4 shrink-0" aria-hidden="true"><path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"></path><path d="M2 6h4"></path><path d="M2 10h4"></path><path d="M2 14h4"></path><path d="M2 18h4"></path><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"></path></svg>',
    },
    {
      name: "File",
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-files size-4 shrink-0" aria-hidden="true"><path d="M15 2h-4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8"></path><path d="M16.706 2.706A2.4 2.4 0 0 0 15 2v5a1 1 0 0 0 1 1h5a2.4 2.4 0 0 0-.706-1.706z"></path><path d="M5 7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 1.732-1"></path></svg>',
    },
    {
      name: "Lainnya",
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-ellipsis size-4 shrink-0" aria-hidden="true"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>',
    },
  ],
  noteReply:
    "Ya, ada.\n\nKeputusan desain — catatan khusus · Kerja / Proyek / Sydia · diperbarui 18 Okt 2026, 09.31",
  paperclip:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-paperclip" aria-hidden="true"><path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"></path></svg>',
  question: 'Apa saya ada catatan dengan judul "Keputusan desain" ?',
  recentTitles: [
    "ada tugas apa aja lusa?",
    "Ada tugas apa aja besok?",
    "Buat tiga tugas: membaca bab pertama, mengerjakan latihan, dan menuli…",
    "Ada tugas apa aja hari ini?",
    "ada tugas apa aja hari ini?",
    'Apa saya ada catatan dengan judul "Keputusan desain" ?',
    "helo?",
    'Apa saya ada catatan dengan judul "Keputusan desain" ?',
    "Tools kamu apa aja?",
    "model AI yang digunakan sekarang apa?",
    "# Sydia personality and ability",
    "Buatkan saya GTA5 make no mistake",
    "Tambahkan tugas ‘Menyiapkan bahan presentasi’ dengan prioritas tinggi…",
    "hello?",
    "Buat tiga tugas: membaca bab pertama, mengerjakan latihan, dan menuli…",
    "Buat tiga tugas: membaca bab pertama, mengerjakan latihan, dan menuli…",
    "Buat acara berjudul Uji dialog jam untuk 23 Oktober 2026 pukul 09.00 …",
    "Buat acara lokal sepanjang hari berjudul Uji dialog multi-hari dari 2…",
  ],
  send: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-send-horizontal" aria-hidden="true"><path d="M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904z"></path><path d="M6 12h16"></path></svg>',
  viewport: { h: 960, w: 1440 },
};
storage.liveWrap = {
  metadata: {
    358: {
      custom: [
        "— catatan khusus ·",
        "Kerja / Proyek / Sydia · diperbarui 18 Okt",
        "2026, 09.31",
      ],
      daily: ["— catatan harian ·", "Hari ini"],
    },
    560: {
      custom: [
        "— catatan khusus · Kerja / Proyek / Sydia ·",
        "diperbarui 18 Okt 2026, 09.31",
      ],
      daily: ["— catatan harian · Hari ini"],
    },
    576: {
      custom: [
        "— catatan khusus · Kerja / Proyek / Sydia ·",
        "diperbarui 18 Okt 2026, 09.31",
      ],
      daily: ["— catatan harian · Hari ini"],
    },
  },
  titles: [
    "ada tugas apa aja lusa?",
    "Ada tugas apa aja besok?",
    "Buat tiga tugas: memba…",
    "Ada tugas apa aja hari i…",
    "ada tugas apa aja hari i…",
    "Apa saya ada catatan d…",
    "helo?",
    "Apa saya ada catatan d…",
    "Tools kamu apa aja?",
    "model AI yang digunak…",
    "# Sydia personality and…",
    "Buatkan saya GTA5 ma…",
    "Tambahkan tugas ‘Men…",
    "hello?",
    "Buat tiga tugas: memba…",
    "Buat tiga tugas: memba…",
    "Buat acara berjudul Uji …",
    "Buat acara lokal sepanj…",
  ],
};
const sourceLogo = penpotUtils.findShape(
  (s) => s.name === "Sydia / Original repository logo",
  screens.custom.b
);
if (!sourceLogo) throw new Error("The original Sydia logo asset is missing");
const logoFills = sourceLogo.fills;
storage.liveSend = await penpot.uploadMediaData(
  "Chat / Aurora send / Captured from live UI",
  Uint8Array.from(
    atob(
      "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"
    ),
    (c) => c.charCodeAt(0)
  ),
  "image/png"
);
const live = (storage.live = {});
live.text = (
  p,
  name,
  value,
  x,
  y,
  w,
  size = 16,
  weight = 400,
  color = C.muted,
  h = 24
) => {
  const t = u.text(p, name, value, x, y, w, size, weight, color, h);
  t.lineHeight = String((size <= 12 ? 16 : size === 14 ? 20 : 24) / size);
  return t;
};
live.icon = (p, name, svg, x, y, n = 16, color = C.muted) => {
  const icon = penpot.createShapeFromSvg(svg.replaceAll("currentColor", color));
  if (!icon) throw new Error("Unable to import live icon: " + name);
  icon.name = "Icon / " + name;
  icon.resize(n, n);
  p.appendChild(icon);
  penpotUtils.setParentXY(icon, x, y);
  return icon;
};
live.logo = (p, x, y, n = 24) => {
  const logo = u.rect(
    p,
    "Sydia / Original repository logo",
    x,
    y,
    n,
    n,
    C.white
  );
  logo.fills = logoFills;
  return logo;
};
live.sidebar = (b) => {
  const nav = penpotUtils.findShape(
    (s) => s.name === "App navigation / Sydia",
    b
  );
  if (!nav) throw new Error("Existing sidebar not found: " + b.name);
  for (const child of [...nav.children]) child.remove();
  u.rect(nav, "Right divider", 271, 0, 1, 960, C.ink, 0, 0.08);
  live.logo(nav, 20, 20);
  live.text(nav, "Brand", "Sydia", 56, 22, 140, 14, 700, C.ink, 20);
  u.icon(nav, "panel", 231, 24, 16);
  storage.liveUI.navIcons.forEach((item, i) => {
    live.icon(
      nav,
      item.name,
      item.svg,
      24,
      76 + 42 * i,
      16,
      i === 0 ? C.ink : C.muted
    );
    live.text(
      nav,
      "Navigation / " + item.name,
      item.name,
      50,
      74 + 42 * i,
      192,
      14,
      400,
      i === 0 ? C.ink : C.muted,
      20
    );
  });
  live.text(
    nav,
    "Conversation section",
    "Percakapan",
    20,
    301,
    74,
    12,
    600,
    C.muted,
    16
  );
  const count = live.text(
    nav,
    "Real conversation count",
    "18",
    96,
    301,
    40,
    10,
    400,
    C.muted,
    16
  );
  count.setPluginData(
    "live-evidence",
    "Seeded demo account: 18 conversations observed on 18 October 2026"
  );
  const list = u.board(
    "Conversation list / Scroll viewport",
    0,
    329,
    271,
    550,
    nav,
    null
  );
  storage.liveWrap.titles.forEach((title, i) => {
    const y = 8.6 + i * 40;
    if (i === 5)
      u.rect(list, "Selected conversation", 12, y, 196, 36, C.ink, 16, 0.06);
    live.text(
      list,
      "Recent conversation / " + title,
      title,
      24,
      y + 8,
      172,
      14,
      500,
      C.ink,
      20
    );
  });
  u.rect(list, "Scroll thumb", 259, 15, 8, 386, C.muted, 4, 0.55);
  u.rule(nav, 0, 879, 271);
  u.rect(nav, "Account avatar", 20, 900, 40, 40, C.brand, 20, 0.12);
  const initials = live.text(
    nav,
    "Initials",
    "DU",
    20,
    910,
    40,
    14,
    600,
    C.muted,
    20
  );
  initials.align = "center";
  live.text(nav, "Account name", "Demo User", 72, 901, 180, 14, 600, C.ink, 20);
  live.text(
    nav,
    "Account email",
    "user@demo.com",
    72,
    923,
    180,
    12,
    400,
    C.muted,
    16
  );
};
live.chip = (p, name, x, y, daily = false, selected = false) => {
  const w = daily ? 158 : 160;
  const chip = u.board(
    "Note chip / " + (daily ? "daily" : "custom") + " / " + name,
    x,
    y,
    w,
    28,
    p,
    null
  );
  chip.fills = u.fill(C.brand, 0.09);
  chip.borderRadius = 16;
  if (selected)
    chip.strokes = [
      {
        strokeColor: C.brand,
        strokeOpacity: 0.35,
        strokeWidth: 1,
        strokeStyle: "solid",
        strokeAlignment: "inner",
      },
    ];
  const icon = u.icon(chip, daily ? "calendar" : "note", 10, 7, 14, C.ink);
  const label = live.text(
    chip,
    "Confirmed note label",
    name,
    30,
    2,
    w - 40,
    14,
    500,
    C.ink,
    24
  );
  const flex = penpotUtils.addFlexLayout(chip, "row");
  flex.horizontalSizing = "fix";
  flex.verticalSizing = "fix";
  flex.alignItems = "center";
  flex.columnGap = 6;
  flex.leftPadding = 10;
  flex.rightPadding = 10;
  flex.topPadding = 2;
  flex.bottomPadding = 2;
  icon.layoutChild.horizontalSizing = "fix";
  icon.layoutChild.verticalSizing = "fix";
  label.layoutChild.horizontalSizing = "fill";
  label.layoutChild.verticalSizing = "fix";
  chip.setPluginData(
    "canonical-ref",
    daily ? "daily:2026-10-18" : "custom:illustrative-design-decisions"
  );
  return chip;
};
live.row = (p, left, y, available, daily, selected) => {
  const chip = live.chip(
    p,
    daily ? "18 Oktober 2026" : "Keputusan desain",
    left + 30,
    y,
    daily,
    selected
  );
  u.rect(p, "List marker", left + 10, y + 12, 4, 4, C.muted, 2);
  const lines =
    storage.liveWrap.metadata[available][daily ? "daily" : "custom"];
  lines.forEach((text, i) => {
    const x = i === 0 ? left + (daily ? 194 : 196) : left + 28;
    const w = i === 0 ? available - (daily ? 194 : 196) : available - 28;
    live.text(
      p,
      "Inline note metadata / " + i,
      text,
      x,
      y + (i === 0 ? 2 : 28 + (i - 1) * 24),
      w,
      16,
      400,
      C.muted,
      24
    );
  });
  return { chip, height: 28 + (lines.length - 1) * 24 };
};
live.composer = (p, x, y, w, active = false, daily = false) => {
  if (active) {
    u.icon(p, daily ? "calendar" : "note", x + 8, y - 26, 14, C.muted);
    live.text(
      p,
      "Current note / Composer context",
      "Sedang diedit: " + (daily ? "18 Oktober 2026" : "Keputusan desain"),
      x + 30,
      y - 28,
      w - 40,
      12,
      500,
      C.muted,
      16
    );
  }
  const box = u.board("Composer / Live UI geometry", x, y, w, 52, p, null);
  const surface = u.rect(
    box,
    "Gray composer / 26 px radius",
    0,
    0,
    w,
    52,
    C.ink,
    26,
    0.06
  );
  surface.strokes = [
    {
      strokeColor: C.ink,
      strokeOpacity: 0.08,
      strokeWidth: 1,
      strokeStyle: "solid",
      strokeAlignment: "inner",
    },
  ];
  live.icon(
    box,
    "Attach file / Live paperclip",
    storage.liveUI.paperclip,
    18,
    18,
    16
  );
  live.text(
    box,
    "Composer text",
    active ? "Ringkas catatan ini." : "Tulis pesan atau lampirkan file...",
    55,
    14,
    w - 108,
    15,
    400,
    active ? C.ink : C.muted,
    24
  );
  const send = u.board(
    "Send / Save note before dispatch",
    w - 43,
    9,
    34,
    34,
    box,
    null
  );
  const image = u.rect(
    send,
    "Aurora send / Captured live asset",
    0,
    0,
    34,
    34,
    C.white,
    17
  );
  image.fills = [{ fillImage: storage.liveSend }];
  if (!active) image.opacity = 0.4;
  return { box, send };
};
live.conversation = (p, open = false, daily = false, mobile = false) => {
  for (const child of [...p.children]) child.remove();
  const w = p.width,
    content = mobile ? w - 32 : Math.min(768, w) - 48;
  const left = mobile ? 16 : (w - Math.min(768, w)) / 2 + 24;
  const available = mobile ? 358 : Math.min(576, content);
  const header = mobile ? 64 : 0;
  if (mobile) {
    u.icon(p, "menu", 30, 24, 16);
    live.text(p, "Mobile app brand", "Sydia", 68, 22, 160, 14, 700, C.ink, 20);
    u.rect(p, "Mobile account avatar", 326, 12, 40, 40, C.brand, 20, 0.12);
    const du = live.text(
      p,
      "Mobile account initials",
      "DU",
      326,
      22,
      40,
      14,
      600,
      C.muted,
      20
    );
    du.align = "center";
    u.rule(p, 0, 63, w);
  }
  const date = live.text(
    p,
    "Message date separator",
    "Hari ini",
    0,
    header + (mobile ? 32 : 40),
    w,
    12,
    500,
    C.muted,
    16
  );
  date.align = "center";
  const bubbleW = Math.min(459.672, content * (mobile ? 0.85 : 0.75));
  const bubbleH = bubbleW < 459 ? 72 : 48;
  const bubbleY = header + (mobile ? 72 : 80);
  const bubbleX = left + content - bubbleW;
  u.rect(
    p,
    "User message / Measured live surface",
    bubbleX,
    bubbleY,
    bubbleW,
    bubbleH,
    C.ink,
    16,
    0.06
  );
  live.text(
    p,
    "User question / Existing seeded conversation",
    storage.liveUI.question,
    bubbleX + 16,
    bubbleY + 12,
    bubbleW - 32,
    16,
    400,
    C.muted,
    bubbleH - 24
  );
  const replyY = bubbleY + bubbleH + 48;
  live.text(
    p,
    "Assistant reply / No avatar or name",
    "Ya, ada.",
    left,
    replyY,
    available,
    16,
    400,
    C.muted,
    24
  );
  const custom = live.row(
    p,
    left,
    replyY + 36,
    available,
    false,
    open && !daily
  );
  const nextY = replyY + 36 + custom.height + 48;
  const nextW = mobile ? 280 : 280;
  u.rect(
    p,
    "User daily-note follow-up",
    left + content - nextW,
    nextY,
    nextW,
    48,
    C.ink,
    16,
    0.06
  );
  live.text(
    p,
    "Daily-note question",
    "Ada catatan harian hari ini juga?",
    left + content - nextW + 16,
    nextY + 12,
    nextW - 32,
    16,
    400,
    C.muted,
    24
  );
  const secondY = nextY + 96;
  live.text(
    p,
    "Daily-note reply / No avatar or name",
    "Ada. Ini catatan harian Anda:",
    left,
    secondY,
    available,
    16,
    400,
    C.muted,
    24
  );
  const day = live.row(p, left, secondY + 36, available, true, open && daily);
  const composerW = mobile ? w - 32 : Math.min(768, w - 48);
  const composer = live.composer(
    p,
    (w - composerW) / 2,
    p.height - 64,
    composerW,
    open,
    daily
  );
  return {
    custom: custom.chip,
    day: day.chip,
    composer: composer.box,
    send: composer.send,
  };
};
for (const key of [
  "closed",
  "custom",
  "daily",
  "failed",
  "conflict",
  "compare",
]) {
  const screen = screens[key];
  live.sidebar(screen.b);
  const conversation = penpotUtils.findShape(
    (s) => s.name === "Conversation / Remains interactive",
    screen.b
  );
  if (!conversation) throw new Error("Conversation frame missing in " + key);
  const refs = live.conversation(
    conversation,
    key !== "closed",
    key === "daily",
    false
  );
  Object.assign(screen, refs);
  screen.b.setPluginData(
    "live-ui-fidelity",
    "Measured through agent-browser at 1440 × 960 using the seeded demo account; 18 October 2026. Existing conversation chrome preserved; note reference/drawer/context remain proposed."
  );
}
const mobileChat = screens.mobileChat;
const mobileRefs = live.conversation(mobileChat.b, false, false, true);
Object.assign(mobileChat, mobileRefs);
for (const key of [
  "mobileCustom",
  "mobileDaily",
  "mobileFailed",
  "mobileCompare",
  "mobileUnavailable",
]) {
  const screen = screens[key],
    b = screen.b;
  for (const child of [...b.children]) {
    if (
      [
        "System time",
        "Signal / low",
        "Signal / medium",
        "Signal / high",
        "Battery",
        "Battery terminal",
        "Home indicator",
      ].includes(child.name)
    ) {
      child.remove();
      continue;
    }
    if (child.name === "Back to chat" || child.name === "Open in Notes") {
      penpotUtils.setParentXY(child, child.parentX, 12);
      continue;
    }
    if (child.name === "Save status") {
      penpotUtils.setParentXY(child, child.parentX, 24);
      continue;
    }
    if (
      (child.name === "Icon / check" || child.name === "Icon / warning") &&
      child.parentY < 104
    ) {
      penpotUtils.setParentXY(child, child.parentX, 27);
      continue;
    }
    if (child.name === "Divider" && child.parentY === 103) {
      penpotUtils.setParentXY(child, 0, 63);
      continue;
    }
    if (child.parentY >= 104 && child.parentY < 616)
      penpotUtils.setParentXY(child, child.parentX, child.parentY - 24);
  }
  b.setPluginData(
    "viewport",
    "390 × 844 browser viewport. No simulated OS status bar or home indicator. Proposed full-screen note editor uses the existing app scale."
  );
}
const go = (from, to) =>
  from.addInteraction("click", {
    type: "navigate-to",
    destination: to,
    preserveScrollPosition: true,
  });
for (const key of [
  "closed",
  "custom",
  "daily",
  "failed",
  "conflict",
  "compare",
]) {
  go(screens[key].custom, screens.custom.b);
  go(screens[key].day, screens.daily.b);
}
go(screens.mobileChat.custom, screens.mobileCustom.b);
go(screens.mobileChat.day, screens.mobileDaily.b);
const scope = penpotUtils.findShape(
  (s) => s.name === "Spec and illustrative-data note",
  penpot.root
);
if (scope)
  scope.characters =
    "Conversation chrome measured from the real seeded account through agent-browser on 18 October 2026. Proposed additions: note chips, editing context and note drawer. The daily-note follow-up and recovery states are illustrative.";
penpot.selection = [screens.custom.b];
penpot.viewport.zoomIntoView([screens.custom.b]);
return {
  correctedDesktopBoards: 6,
  correctedMobileBoards: 6,
  pageId: storage.designPage.id,
  measuredFromLiveUI: true,
};
