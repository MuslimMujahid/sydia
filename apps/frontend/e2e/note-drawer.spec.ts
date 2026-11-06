import { expect, test, type Page } from "@playwright/test";

const at = "2026-10-18T01:31:00.000Z";
const doc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

async function setup(page: Page, includeUserSources = false) {
  const state = {
    title: "Keputusan desain",
    content: doc("Keputusan awal"),
    revision: 1,
    fail: false,
    conflict: false,
    missing: false,
    writes: [] as Record<string, unknown>[],
    sends: [] as Record<string, unknown>[],
    saveGate: undefined as Promise<void> | undefined,
  };

  const item = () => ({
    id: "design",
    kind: "note",
    title: state.title,
    content: state.content,
    revision: state.revision,
    parentId: null,
    path: state.title,
    sourceType: "dashboard",
    updatedAt: at,
    createdAt: at,
    trashedAt: null,
  });

  const detail = {
    conversation: {
      id: "conversation-1",
      title: "Catatan desain",
      createdAt: at,
      updatedAt: at,
    },
    messages: [
      ...(includeUserSources
        ? [
            {
              id: "user-sources",
              conversationId: "conversation-1",
              role: "user",
              content: "Read these notes",
              createdAt: at,
              attachments: [],
              sourceSegments: [
                {
                  type: "source",
                  source: {
                    kind: "note",
                    id: "custom:design",
                    label: "Keputusan desain",
                  },
                },
                { type: "text", text: " and " },
                {
                  type: "source",
                  source: {
                    kind: "note",
                    id: "daily:2026-10-18",
                    label: "2026-10-18",
                  },
                },
              ],
            },
          ]
        : []),
      {
        id: "answer-1",
        conversationId: "conversation-1",
        role: "assistant",
        content:
          "Ya, ada.\n\n- [Keputusan desain](#note/custom%3Adesign)\n- [18 Oktober 2026](#note/daily%3A2026-10-18)",
        createdAt: at,
        attachments: [],
      },
    ],
    assistantRuns: [
      {
        id: "run-1",
        conversationId: "conversation-1",
        assistantMessageId: "answer-1",
        status: "completed",
        errorMessage: null,
        createdAt: at,
        updatedAt: at,
      },
    ],
    toolInvocations: [
      {
        id: "tool-1",
        assistantRunId: "run-1",
        name: "search_notes",
        label: "Find notes",
        status: "completed",
        objectId: null,
        objectType: null,
        state: null,
        output: {
          notes: [
            { ref: "custom:design", title: "Keputusan desain" },
            { ref: "daily:2026-10-18", title: "2026-10-18" },
          ],
        },
        createdAt: at,
        updatedAt: at,
      },
    ],
  };

  await page.route("**/conversations/conversation-1", (r) =>
    r.fulfill({ json: { data: detail } })
  );
  await page.route("**/conversations", (r) =>
    r.fulfill({ json: { data: [] } })
  );
  await page.route("**/notes", (r) =>
    r.fulfill({
      json: {
        data: {
          items: [item()],
          notes: [{ ref: "custom:design", ...item(), excerpt: "" }],
        },
      },
    })
  );
  await page.route("**/notes/backlinks?**", (r) =>
    r.fulfill({ json: { data: [] } })
  );
  await page.route("**/notes/presence/acquire", (r) =>
    r.fulfill({
      json: {
        data: { expiresAt: new Date(Date.now() + 300_000).toISOString() },
      },
    })
  );
  await page.route("**/notes/presence/release", (r) =>
    r.fulfill({ json: { data: { released: true } } })
  );
  await page.route("**/notes/items/design", async (r) => {
    if (state.missing)
      return r.fulfill({
        status: 404,
        json: {
          error: { code: "NOT_FOUND", message: "Catatan tidak tersedia" },
        },
      });

    if (r.request().method() === "PATCH") {
      const data = r.request().postDataJSON() as Record<string, unknown>;
      state.writes.push(data);
      const gate = state.saveGate;
      state.saveGate = undefined;
      if (gate) await gate;
      if (state.fail)
        return r.fulfill({
          status: 503,
          json: {
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "Penyimpanan gagal. Coba lagi.",
            },
          },
        });

      if (state.conflict) {
        state.conflict = false;
        state.revision++;
        state.content = doc("Perubahan dari asisten");

        return r.fulfill({
          status: 409,
          json: {
            error: {
              code: "CONFLICT",
              message: "Catatan berubah",
              details: { reason: "REVISION" },
            },
          },
        });
      }

      expect(data.revision).toBe(state.revision);
      state.revision++;
      state.title = data.title as string;
      state.content = data.content as typeof state.content;
    }

    await r.fulfill({ json: { data: item() } });
  });
  await page.route("**/daily-notes/2026-10-18", (r) =>
    r.fulfill({ json: { data: { note: null } } })
  );
  await page.route("**/conversations/messages/stream", async (r) => {
    const input = r.request().postDataJSON() as Record<string, unknown>;
    state.sends.push(input);
    const result = {
      conversation: detail.conversation,
      userMessage: {
        ...detail.messages[0],
        id: "sent",
        role: "user",
        content: input.content,
      },
      assistantMessage: null,
      assistantRun: detail.assistantRuns[0],
      toolInvocations: [],
    };

    await r.fulfill({
      contentType: "text/event-stream",
      body: `data: ${JSON.stringify({ type: "data-turn", data: result })}\n\ndata: [DONE]\n\n`,
    });
  });
  await page.goto("/e2e/note-drawer.html");

  return state;
}

const custom = (page: Page) =>
  page.getByRole("button", { name: "Catatan: Keputusan desain", exact: true });

const body = (page: Page) =>
  page.getByRole("textbox", { name: "Isi catatan", exact: true });

const daily = (page: Page) =>
  page.getByRole("button", { name: "Catatan: 18 Oktober 2026", exact: true });

const customTab = (page: Page) =>
  page.getByRole("tab", { name: "Keputusan desain", exact: true });

const dailyTab = (page: Page) =>
  page.getByRole("tab", { name: "18 Oktober 2026", exact: true });

async function close(page: Page) {
  const desktop = page.getByRole("button", {
    name: "Tutup panel catatan",
    exact: true,
  });

  await (
    (await desktop.isVisible())
      ? desktop
      : page.getByRole("button", { name: "Chat", exact: true })
  ).click();
}

test("opens the latest note ready to edit and flushes before leaving or sending", async ({
  page,
}) => {
  const s = await setup(page);
  await custom(page).click();
  await expect(
    page.getByRole("textbox", { name: "Judul catatan", exact: true })
  ).toHaveValue("Keputusan desain");
  await body(page).fill("Keputusan yang saya edit");

  if (
    await page.getByRole("button", { name: "Chat", exact: true }).isVisible()
  ) {
    await close(page);
    await custom(page).click();
    await expect(body(page)).toContainText("Keputusan yang saya edit");
  } else {
    await page
      .getByRole("textbox", { name: "Pesan untuk Sydia", exact: true })
      .fill("Ringkas catatan ini");
    await page
      .getByRole("button", { name: "Kirim pesan", exact: true })
      .click();
    await expect.poll(() => s.sends.length).toBe(1);
    expect(s.sends[0]?.activeNoteRef).toBe("custom:design");
  }

  await expect
    .poll(() => JSON.stringify(s.content))
    .toContain("Keputusan yang saya edit");
});
test("retains an unsaved draft after failed close until explicit discard", async ({
  page,
}) => {
  const s = await setup(page);
  await custom(page).click();
  s.fail = true;
  await body(page).fill("Draf penting");
  await close(page);
  await expect(
    page.getByRole("button", { name: "Buang perubahan", exact: true })
  ).toBeVisible();
  await expect(body(page)).toContainText("Draf penting");
  await page
    .getByRole("button", { name: "Buang perubahan", exact: true })
    .click();
  await expect(body(page)).toHaveCount(0);
  expect(JSON.stringify(s.content)).toContain("Keputusan awal");
});
test("preserves conflicts and writes only the explicitly selected version", async ({
  page,
}) => {
  const s = await setup(page);
  await custom(page).click();
  s.conflict = true;
  await body(page).fill("Draf saya");
  await page
    .getByRole("button", { name: "Bandingkan versi", exact: true })
    .click();
  const dialog = page.getByRole("region", {
    name: "Bandingkan versi",
    exact: true,
  });

  await expect(dialog).toContainText("Perubahan dari asisten");
  await expect(dialog).toContainText("Draf saya");
  await dialog
    .getByRole("button", { name: "Simpan draf saya", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(JSON.stringify(s.content)).toContain("Draf saya");
  expect(s.revision).toBe(3);
});
test("opens a cleared daily date without creating a row or an editable title", async ({
  page,
}) => {
  const s = await setup(page);
  await page
    .getByRole("button", { name: "Catatan: 18 Oktober 2026", exact: true })
    .click();
  await expect(body(page)).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Judul catatan", exact: true })
  ).toHaveCount(0);
  expect(s.writes).toHaveLength(0);
});

test("restores usable desktop chat after resizing an open mobile editor", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await custom(page).click();
  await expect(
    page.getByRole("dialog", { name: "Editor catatan", exact: true })
  ).toBeVisible();
  await expect(page.locator(".chat-notes-conversation")).toHaveAttribute(
    "inert",
    ""
  );
  await page.setViewportSize({ width: 1440, height: 960 });
  await expect(
    page.getByRole("complementary", { name: "Editor catatan", exact: true })
  ).toBeVisible();
  await expect(page.locator(".chat-notes-conversation")).not.toHaveAttribute(
    "inert"
  );
  await page
    .getByRole("textbox", { name: "Pesan untuk Sydia", exact: true })
    .fill("Chat remains usable");
  await expect(
    page.getByRole("textbox", { name: "Pesan untuk Sydia", exact: true })
  ).toHaveText("Chat remains usable");
});

test("drains edits made during an in-flight save before switching notes", async ({
  page,
}) => {
  const s = await setup(page);
  await custom(page).click();

  let release: () => void = () => {
    throw new Error("Save gate was not initialized");
  };

  s.saveGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await body(page).fill("Premiere version");
  await expect.poll(() => s.writes.length).toBe(1);
  await body(page).fill("Derniere version");
  await close(page);
  await expect(body(page)).toBeVisible();
  release();
  await expect(body(page)).toHaveCount(0);
  expect(s.writes).toHaveLength(2);
  expect(s.writes[1]?.revision).toBe(2);
  expect(JSON.stringify(s.content)).toContain("Derniere version");
});

test("holds a message with its draft when saving fails and dispatches only after retry", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const s = await setup(page);
  await custom(page).click();
  s.fail = true;
  await body(page).fill("Decision ready for the assistant");
  await page
    .getByRole("textbox", { name: "Pesan untuk Sydia", exact: true })
    .fill("Ringkas catatan ini");
  await page.getByRole("button", { name: "Kirim pesan", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Buang perubahan", exact: true })
  ).toBeVisible();
  expect(s.sends).toHaveLength(0);
  await expect(
    page.getByRole("textbox", { name: "Pesan untuk Sydia", exact: true })
  ).toHaveText("Ringkas catatan ini");
  s.fail = false;
  await page
    .getByRole("button", { name: "Coba lagi", exact: true })
    .first()
    .click();
  await expect.poll(() => s.sends.length).toBe(1);
  expect(s.sends[0]?.activeNoteRef).toBe("custom:design");
  expect(JSON.stringify(s.content)).toContain(
    "Decision ready for the assistant"
  );
});

test("an unavailable selection holds the message until the drawer is explicitly closed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const s = await setup(page);
  s.missing = true;
  await custom(page).click();
  await expect(
    page.getByRole("heading", { name: "Catatan tidak tersedia", exact: true })
  ).toBeVisible();
  const composer = page.getByRole("textbox", {
    name: "Pesan untuk Sydia",
    exact: true,
  });

  await composer.fill("Ringkas catatan ini");
  await page.getByRole("button", { name: "Kirim pesan", exact: true }).click();
  await expect(page.getByRole("alert").first()).toContainText(
    "Muat catatan atau tutup editornya sebelum mengirim. Pesan Anda tetap tersedia."
  );
  await expect(composer).toHaveText("Ringkas catatan ini");
  expect(s.sends).toHaveLength(0);
  await close(page);
  await page.getByRole("button", { name: "Kirim pesan", exact: true }).click();
  await expect.poll(() => s.sends.length).toBe(1);
  expect(s.sends[0]).not.toHaveProperty("activeNoteRef");
});

test("a third edit requires a new comparison before replacing the saved note", async ({
  page,
}) => {
  const s = await setup(page);
  await custom(page).click();
  s.conflict = true;
  await body(page).fill("My retained draft");
  await page
    .getByRole("button", { name: "Bandingkan versi", exact: true })
    .click();
  const comparison = page.getByRole("region", {
    name: "Bandingkan versi",
    exact: true,
  });

  await expect(comparison).toContainText("Perubahan dari asisten");
  s.conflict = true;
  await comparison
    .getByRole("button", { name: "Simpan draf saya", exact: true })
    .click();
  await expect(comparison).toBeVisible();
  await expect(comparison).toContainText("My retained draft");
  expect(JSON.stringify(s.content)).toContain("Perubahan dari asisten");
  await comparison
    .getByRole("button", { name: "Simpan draf saya", exact: true })
    .click();
  await expect(comparison).toHaveCount(0);
  expect(JSON.stringify(s.content)).toContain("My retained draft");
  expect(s.revision).toBe(4);
});

test("an inaccessible dirty note retains a read-only draft until explicit discard", async ({
  page,
}) => {
  const s = await setup(page);
  await custom(page).click();
  s.fail = true;
  await body(page).fill("Preserve this private draft");
  await expect.poll(() => s.writes.length).toBe(1);
  s.missing = true;
  await expect(
    page.getByRole("button", { name: "Salin draf", exact: true })
  ).toBeVisible({ timeout: 10000 });
  await expect(body(page)).toHaveAttribute("contenteditable", "false");
  await expect(body(page)).toContainText("Preserve this private draft");
  await expect(
    page.getByRole("textbox", { name: "Judul catatan", exact: true })
  ).toHaveAttribute("readonly", "");
  const writes = s.writes.length;
  await close(page);
  await expect(
    page.getByRole("button", { name: "Buang perubahan", exact: true })
  ).toBeVisible();
  expect(s.writes).toHaveLength(writes);
  await page
    .getByRole("button", { name: "Buang perubahan", exact: true })
    .click();
  await expect(body(page)).toHaveCount(0);
  expect(JSON.stringify(s.content)).toContain("Keputusan awal");
});

test("a user message custom-note badge opens that note in the editor", async ({
  page,
}) => {
  const state = await setup(page, true);
  await page
    .getByRole("article", { name: "Pesan Anda" })
    .getByRole("button", { name: "Catatan: Keputusan desain", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Isi catatan" })
  ).toContainText("Keputusan awal");
  expect(state.writes).toEqual([]);
});

test("a user message daily-note badge opens the daily note editor", async ({
  page,
}) => {
  await setup(page, true);
  await page
    .getByRole("article", { name: "Pesan Anda" })
    .getByRole("button", { name: /Catatan: .*18 Oktober 2026/ })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Isi catatan" })
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Judul catatan" })
  ).toHaveCount(0);
});

test("keeps multiple notes in tabs and reuses an existing tab with saved edits", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await setup(page);
  await custom(page).click();
  await body(page).fill("Keputusan untuk tab pertama");
  await daily(page).click();

  const tabs = page.getByRole("tablist", { name: "Catatan terbuka" });
  await expect(tabs.getByRole("tab")).toHaveCount(2);
  await expect(dailyTab(page)).toHaveAttribute("aria-selected", "true");
  await customTab(page).click();
  await expect(body(page)).toContainText("Keputusan untuk tab pertama");
  await page
    .getByRole("textbox", { name: "Judul catatan", exact: true })
    .fill("Keputusan terbaru");
  await dailyTab(page).click();
  await expect(
    tabs.getByRole("tab", { name: "Keputusan terbaru", exact: true })
  ).toBeVisible();
  await custom(page).click();
  await expect(tabs.getByRole("tab")).toHaveCount(2);
  await expect(
    page.getByRole("textbox", { name: "Judul catatan", exact: true })
  ).toHaveValue("Keputusan terbaru");
  await expect(page.getByRole("tabpanel")).toContainText(
    "Keputusan untuk tab pertama"
  );
  await page.screenshot({
    path: testInfo.outputPath("note-tabs-desktop.png"),
  });
});

test("closing an inactive tab keeps the selection and closing the last restores chat focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await setup(page);
  await custom(page).click();
  await daily(page).click();
  await customTab(page).hover();
  await page
    .getByRole("button", { name: "Tutup Keputusan desain", exact: true })
    .click();
  await expect(page.getByRole("tab")).toHaveCount(1);
  await expect(dailyTab(page)).toHaveAttribute("aria-selected", "true");
  await expect(body(page)).toBeVisible();
  await dailyTab(page).hover();
  await page
    .getByRole("button", { name: "Tutup 18 Oktober 2026", exact: true })
    .click();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(daily(page)).toBeFocused();
});

test("supports manual keyboard selection and focuses the neighboring tab after deletion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await setup(page);
  await custom(page).click();
  await daily(page).click();
  await dailyTab(page).focus();
  await dailyTab(page).press("ArrowLeft");
  await expect(customTab(page)).toBeFocused();
  await expect(dailyTab(page)).toHaveAttribute("aria-selected", "true");
  await customTab(page).press("Enter");
  await expect(customTab(page)).toHaveAttribute("aria-selected", "true");
  await expect(customTab(page)).toBeFocused();
  await customTab(page).press("Delete");
  await expect(customTab(page)).toHaveCount(0);
  await expect(dailyTab(page)).toHaveAttribute("aria-selected", "true");
  await expect(dailyTab(page)).toBeFocused();
});

test("a failed save blocks tab switching until the draft is explicitly kept or retried", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const state = await setup(page);
  await daily(page).click();
  await custom(page).click();
  state.fail = true;
  await body(page).fill("Draf yang harus tetap terbuka");
  await dailyTab(page).click();
  await expect(
    page.getByRole("button", { name: "Lanjut mengedit", exact: true })
  ).toBeVisible();
  await expect(customTab(page)).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("button", { name: "Lanjut mengedit", exact: true })
    .click();
  await expect(body(page)).toContainText("Draf yang harus tetap terbuka");
  await dailyTab(page).click();
  await expect(
    page.getByRole("button", { name: "Buang perubahan", exact: true })
  ).toBeVisible();
  state.fail = false;
  await page
    .getByRole("button", { name: "Coba lagi", exact: true })
    .first()
    .click();
  await expect(dailyTab(page)).toHaveAttribute("aria-selected", "true");
  await customTab(page).click();
  await expect(body(page)).toContainText("Draf yang harus tetap terbuka");
});

test("mobile keeps open tabs when returning to chat and supports switching and closing them", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await custom(page).click();
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Editor catatan" })
  ).toHaveCount(0);
  await daily(page).click();
  await expect(page.getByRole("tab")).toHaveCount(2);
  await customTab(page).click();
  await expect(body(page)).toContainText("Keputusan awal");
  await page.screenshot({
    path: testInfo.outputPath("note-tabs-mobile.png"),
  });
  await customTab(page).hover();
  await page
    .getByRole("button", { name: "Tutup Keputusan desain", exact: true })
    .click();
  await expect(dailyTab(page)).toHaveAttribute("aria-selected", "true");
  await dailyTab(page).hover();
  await page
    .getByRole("button", { name: "Tutup 18 Oktober 2026", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Editor catatan" })
  ).toHaveCount(0);
  await expect(daily(page)).toBeFocused();
});
