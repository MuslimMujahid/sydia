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
  await page.goto(`/notes?note=${id}`);
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
    ).toBeVisible();
  });

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

  test("folder creation happens inline in the selected custom folder", async ({
    page,
  }) => {
    const folder = await create(page.request, "Kerja", null, "folder");
    await page.goto("/notes");
    await page.getByRole("button", { name: "Kerja", exact: true }).click();
    await page
      .getByRole("button", { name: "Folder baru", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page
      .getByRole("textbox", { name: "Nama folder", exact: true })
      .fill("Proyek");
    await page
      .getByRole("button", { name: "Simpan folder", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await workspace(page.request)).items.find(
            (item) => item.title === "Proyek"
          )?.parentId
      )
      .toBe(folder.id);
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
