import { randomUUID } from "node:crypto";
import {
  test,
  expect,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from "@playwright/test";
import type {
  NotesWorkspace,
  WorkspaceItem,
} from "../src/lib/services/api/notes/notes.api";

const backendURL =
  process.env.PLAYWRIGHT_BACKEND_URL ?? "http://127.0.0.1:5000";

const password = "Notes-workspace-QA-2026!";
type Item = WorkspaceItem & { content: Record<string, unknown>; text: string };

async function data<T>(response: APIResponse): Promise<T> {
  expect(
    response.ok(),
    `HTTP ${response.status()} from ${response.url()}`
  ).toBe(true);
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || !("data" in value))
    throw new Error("Expected the API response envelope.");

  return value.data as T;
}

async function account(page: Page, origin: string) {
  const response = await page.request.post(
    `${backendURL}/api/auth/sign-up/email`,
    {
      headers: { Origin: origin },
      data: {
        name: "Notes workspace test",
        email: `notes-${randomUUID()}@example.com`,
        password,
      },
    }
  );

  expect(response.ok()).toBe(true);
  await data(
    await page.request.patch(`${backendURL}/users/me`, {
      data: {
        name: "Notes workspace test",
        locale: "id",
        timezone: "Asia/Makassar",
        onboardingCompleted: true,
      },
    })
  );
}

function document(text: string) {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

async function create(
  request: APIRequestContext,
  title: string,
  parentId: string | null = null,
  kind: "note" | "folder" = "note",
  text?: string
) {
  return data<Item>(
    await request.post(`${backendURL}/notes/items`, {
      data: {
        kind,
        title,
        parentId,
        requestKey: randomUUID(),
        ...(text ? { content: document(text) } : {}),
      },
    })
  );
}

async function workspace(request: APIRequestContext) {
  return data<NotesWorkspace>(await request.get(`${backendURL}/notes`));
}

async function read(request: APIRequestContext, id: string) {
  return data<Item>(await request.get(`${backendURL}/notes/items/${id}`));
}

async function open(page: Page, id: string) {
  const loaded = page.waitForResponse(
    (response) =>
      response.url() === `${backendURL}/notes/items/${id}` &&
      response.request().method() === "GET"
  );

  await page.goto(`/notes?note=${id}`);
  // Wait for the actual note request before testing the editor. Cold Vite
  // hydration can exceed the assertion deadline on a busy development server.
  expect((await loaded).ok()).toBe(true);
  await expect(
    page.getByRole("textbox", { name: "Judul catatan", exact: true })
  ).toBeVisible({ timeout: 15_000 });
}

test.describe("Notes workspace with the real backend", () => {
  test.setTimeout(90_000);
  test.use({ actionTimeout: 15_000 });
  test.beforeEach(async ({ page, baseURL }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required.");
    await account(page, baseURL);
  });

  test("an empty new note survives reload and becomes the stored resume target", async ({
    page,
  }) => {
    await page.goto("/notes");
    await expect(
      page.getByRole("button", { name: "Catatan baru", exact: true })
    ).toBeEnabled({ timeout: 15_000 });
    await page
      .getByRole("button", { name: "Catatan baru", exact: true })
      .click();
    const title = page.getByRole("textbox", {
      name: "Judul catatan",
      exact: true,
    });

    await expect(title).toHaveValue("Untitled");
    await expect(title).toBeFocused();
    await page.reload();
    await expect(title).toBeVisible({ timeout: 15_000 });
    await expect(title).toHaveValue("Untitled");
    await page
      .getByRole("button", { name: "Catatan baru", exact: true })
      .click();
    await expect(title).toHaveValue("Untitled 2");
    await page.goto("/notes");
    await expect(title).toBeVisible({ timeout: 15_000 });
    await expect(title).toHaveValue("Untitled 2");
    expect(
      (await workspace(page.request)).items.filter(
        (item) => item.kind === "note"
      )
    ).toHaveLength(2);
  });

  test("saved content never displays the empty-editor hint after opening", async ({
    page,
  }) => {
    const note = await create(
      page.request,
      "Saved note",
      null,
      "note",
      "Previously saved writing"
    );

    await open(page, note.id);
    await expect(page.getByRole("textbox", { name: "Isi catatan" })).toHaveText(
      "Previously saved writing"
    );
    await expect(
      page.getByText("Mulai dari hal yang ingin Anda ingat.", { exact: true })
    ).toBeHidden();
    await page.getByRole("textbox", { name: "Isi catatan" }).fill("");
    await expect(
      page.getByText("Mulai dari hal yang ingin Anda ingat.", { exact: true })
    ).toBeHidden();
    await page.getByRole("textbox", { name: "Judul catatan" }).focus();
    await expect(
      page.getByText("Mulai dari hal yang ingin Anda ingat.", { exact: true })
    ).toBeVisible();
  });

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`empty daily note placeholder aligns with the first row and hides on focus at ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/notes?date=2026-10-18");
      const editor = page.getByRole("textbox", {
        name: "Isi catatan",
        exact: true,
      });

      const placeholder = page.getByText(
        "Mulai dari hal yang ingin Anda ingat.",
        { exact: true }
      );

      await expect(editor).toBeVisible();
      await expect(placeholder).toBeVisible();
      const hint = await placeholder.boundingBox();
      await editor.focus();
      await expect(placeholder).toBeHidden();
      // A new daily document has no block until Tiptap first receives focus.
      const firstRow = await editor.locator("p").first().boundingBox();
      if (!firstRow || !hint)
        throw new Error(
          "Expected the empty editor row and placeholder to be visible"
        );

      expect(hint.x).toBe(firstRow.x);
      expect(hint.y).toBe(firstRow.y);
      await editor.press("Tab");
      await expect(placeholder).toBeVisible();
      await editor.fill("Catatan hari ini");
      await editor.press("Tab");
      await expect(placeholder).toBeHidden();
    });
  }

  test("retrying creation after a lost response reopens the same saved note", async ({
    page,
  }) => {
    await page.goto("/notes");
    const createButton = page.getByRole("button", {
      name: "Catatan baru",
      exact: true,
    });

    await expect(createButton).toBeEnabled({ timeout: 15_000 });
    await page.route(
      "**/notes/items",
      async (route) => {
        await route.fetch();
        await route.abort("failed");
      },
      { times: 1 }
    );
    await createButton.click();
    await expect(page.getByRole("alert")).toBeVisible();
    await createButton.click();
    await expect(
      page.getByRole("textbox", { name: "Judul catatan", exact: true })
    ).toHaveValue("Untitled");
    expect((await workspace(page.request)).items).toHaveLength(1);
  });

  test("a folder selected in the tree is the destination of immediate note creation", async ({
    page,
  }) => {
    const work = await create(page.request, "Kerja", null, "folder");
    const project = await create(page.request, "Proyek", work.id, "folder");
    await page.goto("/notes");
    await page.getByRole("button", { name: "Proyek", exact: true }).click();
    await page
      .getByRole("button", { name: "Catatan baru", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Judul catatan" })
    ).toHaveValue("Untitled");
    await expect
      .poll(
        async () =>
          (await workspace(page.request)).items.find(
            (item) => item.kind === "note"
          )?.parentId
      )
      .toBe(project.id);
  });

  test("native dragging and the move picker both change a note's parent", async ({
    page,
  }) => {
    const folder = await create(page.request, "Kerja", null, "folder");
    const note = await create(page.request, "Rencana");
    await open(page, note.id);
    await page
      .getByRole("button", { name: "Rencana", exact: true })
      .locator("..")
      .dragTo(
        page.getByRole("button", { name: "Kerja", exact: true }).locator("..")
      );
    await expect
      .poll(async () => (await read(page.request, note.id)).parentId)
      .toBe(folder.id);
    await page
      .getByRole("button", { name: "Tindakan Rencana", exact: true })
      .last()
      .click();
    await page.getByRole("menuitem", { name: "Pindahkan ke…" }).click();
    await page.getByRole("radio", { name: "Semua catatan (akar)" }).check();
    await page.getByRole("button", { name: "Pindahkan", exact: true }).click();
    await expect
      .poll(async () => (await read(page.request, note.id)).parentId)
      .toBeNull();
  });

  test("unresolved link suggestions create nothing until the explicit create action", async ({
    page,
  }) => {
    const folder = await create(page.request, "Riset", null, "folder");
    const source = await create(page.request, "Sumber", folder.id);
    await open(page, source.id);
    await page
      .getByRole("button", { name: "Tautkan catatan", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Cari judul atau lokasi catatan" })
      .fill("Temuan baru");
    expect(
      (await workspace(page.request)).items.filter(
        (item) => item.kind === "note"
      )
    ).toHaveLength(1);
    await page
      .getByRole("button", { name: "Buat catatan “Temuan baru”", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "Buka Temuan baru", exact: true })
    ).toBeVisible();
    await expect
      .poll(async () =>
        JSON.stringify((await read(page.request, source.id)).content)
      )
      .toContain("noteLink");
    const target = (await workspace(page.request)).items.find(
      (item) => item.title === "Temuan baru"
    );

    expect(target?.parentId).toBe(folder.id);
  });

  test("resolved links and incoming links survive destination rename and move", async ({
    page,
  }) => {
    const folder = await create(page.request, "Tujuan", null, "folder");
    const target = await create(page.request, "Temuan");
    const source = await create(page.request, "Sumber");
    await data(
      await page.request.patch(`${backendURL}/notes/items/${source.id}`, {
        data: {
          revision: source.revision,
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "noteLink",
                    attrs: { target: `custom:${target.id}`, label: "Temuan" },
                  },
                ],
              },
            ],
          },
        },
      })
    );
    await data(
      await page.request.patch(`${backendURL}/notes/items/${target.id}`, {
        data: {
          revision: target.revision,
          title: "Temuan terbaru",
          parentId: folder.id,
        },
      })
    );
    await open(page, source.id);
    await page
      .getByRole("link", { name: "Buka Temuan terbaru", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Judul catatan" })
    ).toHaveValue("Temuan terbaru");
    await expect(
      page.locator("details").getByRole("button", { name: /Sumber/ })
    ).toBeVisible();
  });

  test("a competing server edit pauses autosave without discarding the local draft", async ({
    page,
  }) => {
    const note = await create(
      page.request,
      "Konflik",
      null,
      "note",
      "Original text"
    );

    await open(page, note.id);
    await page
      .getByRole("textbox", { name: "Isi catatan", exact: true })
      .fill("Draf lokal saya");
    await data(
      await page.request.patch(`${backendURL}/notes/items/${note.id}`, {
        data: {
          revision: note.revision,
          content: document("Versi dari asisten"),
        },
      })
    );
    await expect(
      page.getByText("Penyimpanan otomatis dijeda", { exact: true })
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Isi catatan" })).toHaveText(
      "Draf lokal saya"
    );
    await page
      .getByRole("button", { name: "Bandingkan versi", exact: true })
      .click();
    await expect(
      page.getByRole("dialog").getByText("Versi dari asisten", { exact: true })
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Simpan draf saya", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect
      .poll(async () => (await read(page.request, note.id)).text)
      .toBe("Draf lokal saya");
  });

  test("folder deletion and restoration preserve the subtree before explicit permanent deletion", async ({
    page,
  }) => {
    const folder = await create(page.request, "Arsip", null, "folder");
    const child = await create(page.request, "Simpan saya", folder.id);
    await page.goto("/notes");
    await page
      .getByRole("button", { name: "Tindakan Arsip", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "Pindahkan ke Sampah" }).click();
    await page.getByRole("button", { name: /Sampah 1/ }).click();
    await page.getByRole("button", { name: "Pulihkan", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Pulihkan", exact: true })
      .click();
    await expect
      .poll(async () => (await read(page.request, child.id)).parentId)
      .toBe(folder.id);
    const restored = (await workspace(page.request)).items.find(
      (item) => item.id === folder.id
    )!;

    await data(
      await page.request.post(`${backendURL}/notes/items/${folder.id}/trash`, {
        data: { revision: restored.revision },
      })
    );
    await page.getByRole("button", { name: /Sampah/ }).click();
    await page
      .getByRole("button", { name: "Hapus permanen", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("seluruh isinya");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Hapus permanen", exact: true })
      .click();
    await expect
      .poll(async () => (await workspace(page.request)).items)
      .toEqual([]);
  });

  test("body search and descendant folder filtering exclude unrelated notes and Trash", async ({
    page,
  }) => {
    const folder = await create(page.request, "Kerja", null, "folder");
    const child = await create(page.request, "Proyek", folder.id, "folder");
    await create(
      page.request,
      "Rencana",
      child.id,
      "note",
      "Membahas peluncuran produk"
    );
    const trashed = await create(
      page.request,
      "Dihapus",
      folder.id,
      "note",
      "peluncuran lama"
    );

    await data(
      await page.request.post(`${backendURL}/notes/items/${trashed.id}/trash`, {
        data: { revision: trashed.revision },
      })
    );
    await create(page.request, "Pribadi", null, "note", "peluncuran pribadi");
    await page.goto("/notes");
    await page
      .getByRole("textbox", { name: "Cari catatan", exact: true })
      .fill("peluncuran");
    await expect(
      page.getByRole("textbox", { name: "Cari catatan", exact: true })
    ).toHaveValue("peluncuran");
    await expect(
      page.getByRole("heading", { name: "Cari catatan", exact: true })
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Folder", exact: true })
      .selectOption(folder.id);
    await expect(
      page.getByRole("button", { name: /Rencana.*Membahas peluncuran/ })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Pribadi.*peluncuran pribadi/ })
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: /Dihapus.*peluncuran lama/ })
    ).not.toBeVisible();
  });

  test("daily and custom links work together and legacy date links still open the requested day", async ({
    page,
  }) => {
    const target = await create(page.request, "Riset pengguna");
    await data(
      await page.request.put(`${backendURL}/daily-notes/2026-10-17`, {
        data: {
          expectedUpdatedAt: null,
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "noteLink",
                    attrs: {
                      target: `custom:${target.id}`,
                      label: target.title,
                    },
                  },
                ],
              },
            ],
          },
        },
      })
    );
    await page.goto("/daily-notes?date=2026-10-17");
    await expect(page).toHaveURL(/\/notes\?date=2026-10-17/);
    await page.getByRole("link", { name: "Buka Riset pengguna" }).click();
    await expect(
      page.locator("details").getByRole("button", { name: /2026-10-17/ })
    ).toBeVisible();
  });

  test("a narrow viewport supports navigation, title editing and folder moves without dragging", async ({
    page,
  }) => {
    const folder = await create(page.request, "Pribadi", null, "folder");
    const note = await create(page.request, "Catatan pada perangkat seluler");
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, note.id);
    await expect(
      page.getByRole("textbox", { name: "Judul catatan" })
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Tindakan Catatan pada perangkat seluler",
        exact: true,
      })
      .click();
    await page.getByRole("menuitem", { name: "Pindahkan ke…" }).click();
    await page.getByRole("radio", { name: "Pribadi", exact: true }).check();
    await page.getByRole("button", { name: "Pindahkan", exact: true }).click();
    await expect
      .poll(async () => (await read(page.request, note.id)).parentId)
      .toBe(folder.id);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
  });

  test("title and body autosave together without reverting either field", async ({
    page,
  }) => {
    const note = await create(page.request, "Before");
    await open(page, note.id);
    await page
      .getByRole("textbox", { name: "Judul catatan", exact: true })
      .fill("Rencana peluncuran");
    await page
      .getByRole("textbox", { name: "Isi catatan", exact: true })
      .fill("Isi catatan terbaru");
    await expect
      .poll(async () => (await read(page.request, note.id)).title)
      .toBe("Rencana peluncuran");
    await expect
      .poll(async () => (await read(page.request, note.id)).text)
      .toBe("Isi catatan terbaru");
    await page.reload();
    await expect(
      page.getByRole("textbox", { name: "Judul catatan" })
    ).toHaveValue("Rencana peluncuran");
    await expect(page.getByRole("textbox", { name: "Isi catatan" })).toHaveText(
      "Isi catatan terbaru"
    );
  });

  test("inline folder creation selects its name inside the selected folder and keeps the note open", async ({
    page,
  }) => {
    const work = await create(page.request, "Kerja", null, "folder");
    const project = await create(page.request, "Proyek", work.id, "folder");
    const note = await create(page.request, "Rencana peluncuran", project.id);
    await open(page, note.id);
    await page
      .getByRole("button", { name: "Folder baru", exact: true })
      .click();
    const form = page.getByRole("form", { name: "Folder baru", exact: true });
    const input = form.getByRole("textbox", {
      name: "Nama folder",
      exact: true,
    });

    await expect(input).toHaveValue("Folder baru");
    await expect(input).toBeFocused();
    expect(
      await input.evaluate((element: HTMLInputElement) =>
        element.value.substring(element.selectionStart!, element.selectionEnd!)
      )
    ).toBe("Folder baru");
    await expect(input).toHaveAccessibleDescription(/Di Kerja \/ Proyek/);
    await expect(form.getByRole("button")).toHaveCount(0);
    await input.fill("Riset");
    await input.press("Enter");
    await expect(form).toBeHidden();
    await expect
      .poll(
        async () =>
          (await workspace(page.request)).items.find(
            (item) => item.title === "Riset"
          )?.parentId
      )
      .toBe(project.id);
    await expect(page).toHaveURL(`/notes?note=${note.id}`);
    await expect(
      page.getByRole("textbox", { name: "Judul catatan", exact: true })
    ).toHaveValue("Rencana peluncuran");
  });

  test("inline folder creation reveals collapsed ancestors before focusing the draft", async ({
    page,
  }) => {
    const work = await create(page.request, "Kerja", null, "folder");
    const project = await create(page.request, "Proyek", work.id, "folder");
    const note = await create(page.request, "Catatan proyek", project.id);
    await open(page, note.id);
    await page
      .getByRole("button", { name: "Ciutkan Kerja", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Folder baru", exact: true })
      .click();
    const input = page.getByRole("textbox", {
      name: "Nama folder",
      exact: true,
    });

    await expect(input).toBeFocused();
    await expect(
      page.getByRole("button", { name: "Ciutkan Kerja", exact: true })
    ).toHaveAttribute("aria-expanded", "true");
    await input.fill("Subfolder");
    await input.press("Enter");
    await expect(
      page.getByRole("button", { name: "Subfolder", exact: true })
    ).toBeVisible();
  });

  test("inline folder creation at root saves a trimmed name on blur", async ({
    page,
  }) => {
    const note = await create(page.request, "Catatan di root");
    await open(page, note.id);
    await page
      .getByRole("button", { name: "Folder baru", exact: true })
      .click();
    const input = page.getByRole("textbox", {
      name: "Nama folder",
      exact: true,
    });

    await expect(input).toHaveAccessibleDescription(/Di Semua catatan/);
    await input.fill("  Arsip  ");
    await page
      .getByRole("textbox", { name: "Judul catatan", exact: true })
      .focus();

    await expect(input).toBeHidden();
    const folder = (await workspace(page.request)).items.find(
      (item) => item.title === "Arsip"
    );

    expect(folder).toMatchObject({
      kind: "folder",
      title: "Arsip",
      parentId: null,
    });
    await expect(
      page.getByRole("textbox", { name: "Judul catatan", exact: true })
    ).toBeFocused();
  });

  test("Escape cancels inline folder creation without saving and restores the trigger", async ({
    page,
  }) => {
    const note = await create(page.request, "Catatan tetap terbuka");
    await open(page, note.id);
    const trigger = page.getByRole("button", {
      name: "Folder baru",
      exact: true,
    });

    await trigger.click();
    const input = page.getByRole("textbox", {
      name: "Nama folder",
      exact: true,
    });

    await input.fill("Jangan simpan");
    await input.press("Escape");

    await expect(input).toBeHidden();
    await expect(trigger).toBeFocused();
    expect((await workspace(page.request)).items).toHaveLength(1);
  });

  test("leaving an empty inline folder name cancels without a request", async ({
    page,
  }) => {
    const note = await create(page.request, "Catatan tetap terbuka");
    await open(page, note.id);
    await page
      .getByRole("button", { name: "Folder baru", exact: true })
      .click();
    const input = page.getByRole("textbox", {
      name: "Nama folder",
      exact: true,
    });

    await input.fill("   ");
    await page
      .getByRole("textbox", { name: "Judul catatan", exact: true })
      .focus();

    await expect(input).toBeHidden();
    expect((await workspace(page.request)).items).toHaveLength(1);
  });

  test("an inline folder name collision preserves the draft for correction", async ({
    page,
  }) => {
    const folder = await create(page.request, "Kerja", null, "folder");
    await create(page.request, "Riset", folder.id, "folder");
    const note = await create(page.request, "Catatan kerja", folder.id);
    await open(page, note.id);
    await page
      .getByRole("button", { name: "Folder baru", exact: true })
      .click();
    const form = page.getByRole("form", { name: "Folder baru", exact: true });
    const input = form.getByRole("textbox", {
      name: "Nama folder",
      exact: true,
    });

    await input.fill("Riset");
    await input.press("Enter");

    await expect(form.getByRole("alert")).toContainText("Nama sudah digunakan");
    await expect(input).toHaveValue("Riset");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toBeFocused();
    await input.fill("Riset baru");
    await input.press("Enter");
    await expect(form).toBeHidden();
    await expect
      .poll(
        async () =>
          (await workspace(page.request)).items.find(
            (item) => item.title === "Riset baru"
          )?.parentId
      )
      .toBe(folder.id);
  });

  test("retrying inline folder creation after a lost response creates exactly one folder", async ({
    page,
  }) => {
    const note = await create(page.request, "Catatan kerja");
    await open(page, note.id);
    await page.route(
      "**/notes/items",
      async (route) => {
        await route.fetch();
        await route.abort("failed");
      },
      { times: 1 }
    );
    await page
      .getByRole("button", { name: "Folder baru", exact: true })
      .click();
    const form = page.getByRole("form", { name: "Folder baru", exact: true });
    const input = form.getByRole("textbox", {
      name: "Nama folder",
      exact: true,
    });

    await input.fill("Arsip");
    await input.press("Enter");
    await expect(form.getByRole("alert")).toBeVisible();
    await expect(input).toHaveValue("Arsip");
    await input.press("Enter");

    await expect(form).toBeHidden();
    expect(
      (await workspace(page.request)).items.filter(
        (item) => item.kind === "folder"
      )
    ).toHaveLength(1);
  });

  test("pending inline folder creation is read-only and Enter plus blur submits once", async ({
    page,
  }) => {
    const note = await create(page.request, "Catatan kerja");
    await open(page, note.id);

    let release: () => void = () => {
      throw new Error("Request gate not initialized");
    };

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    let requests = 0;
    await page.route("**/notes/items", async (route) => {
      requests += 1;
      await gate;
      await route.continue();
    });
    await page
      .getByRole("button", { name: "Folder baru", exact: true })
      .click();
    const form = page.getByRole("form", { name: "Folder baru", exact: true });
    const input = form.getByRole("textbox", {
      name: "Nama folder",
      exact: true,
    });

    try {
      await input.fill("Arsip");
      await input.press("Enter");
      await expect(form).toHaveAttribute("aria-busy", "true");
      await expect(input).toHaveAttribute("readonly", "");
      await input.press("Enter");
      await page
        .getByRole("textbox", { name: "Judul catatan", exact: true })
        .focus();
      expect(requests).toBe(1);
    } finally {
      release();
    }

    await expect(form).toBeHidden();
    expect(
      (await workspace(page.request)).items.filter(
        (item) => item.kind === "folder"
      )
    ).toHaveLength(1);
  });

  test("mobile inline folder creation keeps the drawer open on Escape and saves with Done", async ({
    page,
  }) => {
    const folder = await create(page.request, "Kerja", null, "folder");
    const note = await create(page.request, "Catatan kerja", folder.id);
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, note.id);
    await page
      .getByRole("button", { name: "Buka navigasi catatan", exact: true })
      .click();
    const drawer = page.getByRole("dialog");
    const trigger = drawer.getByRole("button", {
      name: "Folder baru",
      exact: true,
    });

    await trigger.click();
    const input = drawer.getByRole("textbox", {
      name: "Nama folder",
      exact: true,
    });

    await expect(input).toBeFocused();
    await input.press("Escape");
    await expect(drawer).toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await input.fill("Riset mobile");
    await expect(input).toHaveAttribute("enterkeyhint", "done");
    await input.press("Enter");

    await expect(input).toBeHidden();
    await expect(drawer).toBeVisible();
    await expect
      .poll(
        async () =>
          (await workspace(page.request)).items.find(
            (item) => item.title === "Riset mobile"
          )?.parentId
      )
      .toBe(folder.id);
  });

  test("an active document does not mark its parent folder active", async ({
    page,
  }) => {
    const folder = await create(page.request, "Sydia", null, "folder");
    const note = await create(page.request, "Sydia - First note", folder.id);
    await open(page, note.id);
    const navigation = page.getByRole("complementary", {
      name: "Navigasi catatan",
    });

    const parent = navigation.getByRole("button", {
      name: "Sydia",
      exact: true,
    });

    const document = navigation.getByRole("button", {
      name: "Sydia - First note",
      exact: true,
    });

    await expect(document).toHaveAttribute("aria-current", "page");
    await expect(parent).not.toHaveAttribute("aria-current");
    await parent.click();
    await expect(parent).toHaveAttribute("aria-current", "page");
    await expect(document).not.toHaveAttribute("aria-current");
  });

  test("folder tree rows have a small gap at the same and nested levels", async ({
    page,
  }) => {
    const work = await create(page.request, "Kerja", null, "folder");
    await create(page.request, "Proyek", work.id, "folder");
    await create(page.request, "Pribadi", null, "folder");
    const note = await create(page.request, "Catatan");
    await open(page, note.id);
    const parent = await page
      .getByRole("button", { name: "Kerja", exact: true })
      .locator("..")
      .boundingBox();

    const child = await page
      .getByRole("button", { name: "Proyek", exact: true })
      .locator("..")
      .boundingBox();

    const sibling = await page
      .getByRole("button", { name: "Pribadi", exact: true })
      .locator("..")
      .boundingBox();

    expect(child!.y - parent!.y - parent!.height).toBe(4);
    expect(sibling!.y - child!.y - child!.height).toBe(4);
  });

  test("daily navigation fits its sidebar without horizontal overflow and scrolls vertically", async ({
    page,
  }) => {
    await create(page.request, "Kerja", null, "folder");
    await create(page.request, "Pribadi", null, "folder");
    await page.setViewportSize({ width: 1280, height: 620 });
    await page.goto("/notes?date=2026-10-18");
    const navigation = page.getByRole("complementary", {
      name: "Navigasi catatan",
    });

    await expect(navigation.getByRole("grid")).toBeVisible();
    const measurements = await navigation.getByRole("grid").evaluate((grid) => {
      const scroller = grid.closest(".overflow-y-auto");
      if (!(scroller instanceof HTMLElement))
        throw new Error("Missing navigation scroll container");
      const calendar = grid.parentElement;
      if (!calendar) throw new Error("Missing daily calendar");
      const style = getComputedStyle(scroller);
      const sidebar = scroller.closest("aside");
      if (!sidebar) throw new Error("Missing notes sidebar");
      scroller.scrollTop = scroller.scrollHeight;

      return {
        horizontalOverflow: scroller.scrollWidth - scroller.clientWidth,
        calendarOverflow: calendar.scrollWidth - calendar.clientWidth,
        verticalOverflow: scroller.scrollHeight > scroller.clientHeight,
        scrolled: scroller.scrollTop > 0,
        scrollbarWidth: style.scrollbarWidth,
        scrollbarColor: style.scrollbarColor,
        rightInset:
          sidebar.getBoundingClientRect().right -
          scroller.getBoundingClientRect().right,
      };
    });

    expect(measurements.horizontalOverflow).toBe(0);
    expect(measurements.calendarOverflow).toBe(0);
    expect(measurements.verticalOverflow).toBe(true);
    expect(measurements.scrolled).toBe(true);
    expect(measurements.scrollbarWidth).toBe("thin");
    expect(measurements.scrollbarColor).not.toBe("auto");
    expect(measurements.rightInset).toBe(1); // Sidebar border only; no content inset.
    await expect(
      navigation.getByRole("button", { name: "Sampah 0", exact: true })
    ).toBeVisible();
  });

  test("mobile daily navigation fits its drawer and retains vertical scrolling", async ({
    page,
  }) => {
    await create(page.request, "Kerja", null, "folder");
    await page.setViewportSize({ width: 390, height: 660 });
    await page.goto("/notes?date=2026-10-18");
    await expect(
      page.getByRole("button", { name: "Catatan baru", exact: true })
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Buka navigasi catatan", exact: true })
      .click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("grid")).toBeVisible();
    const measurements = await drawer.getByRole("grid").evaluate((grid) => {
      const scroller = grid.closest(".overflow-y-auto");
      if (!(scroller instanceof HTMLElement))
        throw new Error("Missing navigation scroll container");
      const drawer = scroller.closest('[role="dialog"]');
      if (!drawer) throw new Error("Missing navigation drawer");
      scroller.scrollTop = scroller.scrollHeight;

      return {
        horizontalOverflow: scroller.scrollWidth - scroller.clientWidth,
        scrolled: scroller.scrollTop > 0,
        rightInset:
          drawer.getBoundingClientRect().right -
          scroller.getBoundingClientRect().right,
      };
    });

    expect(measurements.horizontalOverflow).toBe(0);
    expect(measurements.scrolled).toBe(true);
    expect(measurements.rightInset).toBe(0);
    await expect(
      drawer.getByRole("button", { name: "Sampah 0", exact: true })
    ).toBeVisible();
  });

  test("a duplicate title reports a name error and editing the title resumes autosave", async ({
    page,
  }) => {
    await create(page.request, "Nama terpakai");
    const note = await create(page.request, "Catatan lain");
    await open(page, note.id);
    await page
      .getByRole("textbox", { name: "Judul catatan" })
      .fill("Nama terpakai");
    await expect(
      page.getByText(
        "Nama sudah digunakan di folder tujuan. Pilih nama lain.",
        { exact: true }
      )
    ).toBeVisible();
    await expect(
      page.getByText("Penyimpanan otomatis dijeda", { exact: true })
    ).not.toBeVisible();
    await page
      .getByRole("textbox", { name: "Judul catatan" })
      .fill("Nama yang berbeda");
    await expect
      .poll(async () => (await read(page.request, note.id)).title)
      .toBe("Nama yang berbeda");
  });

  test("typing an unresolved wiki link keeps it as a link without creating a destination", async ({
    page,
  }) => {
    const note = await create(page.request, "Sumber");
    await open(page, note.id);
    await page
      .getByRole("textbox", { name: "Isi catatan" })
      .pressSequentially("[[");
    const query = page.getByRole("textbox", {
      name: "Cari judul atau lokasi catatan",
    });

    await query.fill("Ide belum ditulis]]");
    await expect(query).toHaveValue("Ide belum ditulis");
    await query.press("Escape");
    await expect(
      page.getByRole("link", {
        name: "Pilih atau buat catatan: Ide belum ditulis",
      })
    ).toBeVisible();
    await expect
      .poll(async () =>
        JSON.stringify((await read(page.request, note.id)).content)
      )
      .toContain('"target":null');
    expect((await workspace(page.request)).items).toHaveLength(1);
  });

  test("a failed background refresh leaves the local draft in the editor", async ({
    page,
  }) => {
    const note = await create(
      page.request,
      "Masih tersedia",
      null,
      "note",
      "Original"
    );

    await open(page, note.id);
    const pattern = `**/notes/items/${note.id}`;
    await page.route(pattern, (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Temporary test outage",
            details: {},
          },
        }),
      })
    );
    await page
      .getByRole("textbox", { name: "Isi catatan" })
      .fill("Draf yang belum tersimpan");
    await expect(
      page.getByText("Temporary test outage", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText(
        "Catatan belum dapat diperbarui. Draf Anda tetap tersedia.",
        { exact: false }
      )
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("textbox", { name: "Isi catatan" })).toHaveText(
      "Draf yang belum tersimpan"
    );
    await page.unroute(pattern);
    await page
      .getByRole("button", { name: "Coba lagi", exact: true })
      .last()
      .click();
    await expect
      .poll(async () => (await read(page.request, note.id)).text)
      .toBe("Draf yang belum tersimpan");
  });

  test("simultaneous sibling creates cannot commit the same title twice", async ({
    page,
  }) => {
    const [first, second] = await Promise.all([
      page.request.post(`${backendURL}/notes/items`, {
        data: { kind: "note", title: "Identik", requestKey: randomUUID() },
      }),
      page.request.post(`${backendURL}/notes/items`, {
        data: { kind: "note", title: "Identik", requestKey: randomUUID() },
      }),
    ]);

    expect([first.status(), second.status()].sort()).toEqual([201, 409]);
    expect((await workspace(page.request)).items).toHaveLength(1);
  });

  test("competing custom-note edits commit only one revision", async ({
    page,
  }) => {
    const note = await create(page.request, "Concurrent");
    const [first, second] = await Promise.all([
      page.request.patch(`${backendURL}/notes/items/${note.id}`, {
        data: { revision: note.revision, content: document("First edit") },
      }),
      page.request.patch(`${backendURL}/notes/items/${note.id}`, {
        data: { revision: note.revision, content: document("Second edit") },
      }),
    ]);

    expect([first.status(), second.status()].sort()).toEqual([200, 409]);
    expect((await read(page.request, note.id)).revision).toBe(2);
  });

  test("a stale daily-note save cannot overwrite a newer version", async ({
    page,
  }) => {
    const original = await data<{ note: { updatedAt: string } }>(
      await page.request.put(`${backendURL}/daily-notes/2026-10-17`, {
        data: {
          expectedUpdatedAt: null,
          content: document("Original daily note"),
        },
      })
    );

    const updated = await data<{ note: { updatedAt: string } }>(
      await page.request.put(`${backendURL}/daily-notes/2026-10-17`, {
        data: {
          expectedUpdatedAt: original.note.updatedAt,
          content: document("Latest daily note"),
        },
      })
    );

    expect(updated.note.updatedAt).not.toBe(original.note.updatedAt);
    const stale = await page.request.put(
      `${backendURL}/daily-notes/2026-10-17`,
      {
        data: {
          expectedUpdatedAt: original.note.updatedAt,
          content: document("Stale replacement"),
        },
      }
    );

    expect(stale.status()).toBe(409);
    const current = await data<{ note: { text: string } }>(
      await page.request.get(`${backendURL}/daily-notes/2026-10-17`)
    );

    expect(current.note.text).toBe("Latest daily note");
  });

  test("another account cannot read, change, move into or inspect backlinks for private items", async ({
    page,
    browser,
    baseURL,
  }) => {
    const folder = await create(page.request, "Private folder", null, "folder");
    const note = await create(page.request, "Private note", folder.id);
    const outsider = await browser.newContext();

    try {
      const outsiderPage = await outsider.newPage();
      if (!baseURL) throw new Error("Playwright baseURL is required.");
      await account(outsiderPage, baseURL);
      expect(
        (
          await outsiderPage.request.get(`${backendURL}/notes/items/${note.id}`)
        ).status()
      ).toBe(404);
      expect(
        (
          await outsiderPage.request.patch(
            `${backendURL}/notes/items/${note.id}`,
            { data: { revision: note.revision, title: "Changed" } }
          )
        ).status()
      ).toBe(404);
      expect(
        (
          await outsiderPage.request.post(`${backendURL}/notes/items`, {
            data: {
              kind: "note",
              title: "Intrusion",
              parentId: folder.id,
              requestKey: randomUUID(),
            },
          })
        ).status()
      ).toBe(409);
      expect(
        await data(
          await outsiderPage.request.get(`${backendURL}/notes/backlinks`, {
            params: { target: `custom:${note.id}` },
          })
        )
      ).toEqual([]);
    } finally {
      await outsider.close();
    }
  });
});
