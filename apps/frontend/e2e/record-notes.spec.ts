import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test, expect, type Page, type APIResponse } from "@playwright/test";
import type {
  RecordMetadata,
  RecordPage,
  RecordColumn,
} from "../src/lib/services/api/record-notes/record-notes.api";

const backend = process.env.PLAYWRIGHT_BACKEND_URL ?? "http://localhost:5000";
const columns: RecordColumn[] = [
  { id: "date", name: "Tanggal", type: "date", required: false },
  { id: "product", name: "Produk", type: "text", required: false },
  { id: "quantity", name: "Jumlah", type: "number", required: false },
  { id: "price", name: "Harga", type: "number", unit: "IDR", required: false },
  { id: "paid", name: "Lunas", type: "boolean", required: false },
  {
    id: "channel",
    name: "Kanal",
    type: "choice",
    options: ["Toko", "Online"],
    required: false,
  },
];

async function data<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), await response.text()).toBe(true);

  return ((await response.json()) as { data: T }).data;
}

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page
    .getByLabel("Email", { exact: true })
    .fill(process.env.RECORDS_EMAIL ?? "user@demo.com");
  await page
    .getByLabel("Kata sandi", { exact: true })
    .fill(process.env.RECORDS_PASSWORD ?? "Demo1234!");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Pesan untuk Sydia" })
  ).toBeVisible();
}

const created = new Map<Page, string[]>();

async function fixture(page: Page, count = 25) {
  const title = `Record QA ${randomUUID().slice(0, 8)}`;
  const meta = await data<RecordMetadata>(
    await page.request.post(`${backend}/record-notes`, {
      data: {
        title,
        description: "Data pengujian tabel",
        columns,
        parentId: null,
        requestKey: randomUUID(),
      },
    })
  );

  created.get(page)!.push(meta.id);
  const sessionId = randomUUID();
  await data(
    await page.request.post(`${backend}/notes/presence/acquire`, {
      data: { ref: `custom:${meta.id}`, sessionId },
    })
  );
  if (count)
    await data(
      await page.request.post(`${backend}/record-notes/${meta.id}/mutations`, {
        data: {
          revision: 1,
          sessionId,
          requestKey: randomUUID(),
          change: {
            action: "add_rows",
            rows: Array.from({ length: count }, (_, i) => ({
              values: {
                date: "2026-10-01",
                product: i === 0 ? 'Kopi "susu", 一' : "Roti gandum",
                quantity: String(i),
                price: "12.5",
                paid: false,
                channel: "Toko",
              },
            })),
          },
        },
      })
    );
  await data(
    await page.request.post(`${backend}/notes/presence/release`, {
      data: { ref: `custom:${meta.id}`, sessionId },
    })
  );
  const [savedContent] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url() === `${backend}/record-notes/${meta.id}/content` &&
        response.request().method() === "POST"
    ),
    page.goto(`/notes?note=${meta.id}`),
  ]);

  expect(savedContent.ok()).toBe(true);
  await expect(
    page.getByRole("button", { name: "Tambah kolom", exact: true })
  ).toBeEnabled();
  await expect(
    page.getByText(`Baris ${count ? "1–12" : "0–0"} dari ${count}`, {
      exact: true,
    })
  ).toBeVisible();

  return meta;
}

async function content(page: Page, id: string) {
  return data<RecordPage>(
    await page.request.post(`${backend}/record-notes/${id}/content`, {
      data: { limit: 50 },
    })
  );
}

async function cellEdit(
  page: Page,
  column: string,
  row: number,
  value: string
) {
  const cell = page.getByRole("gridcell", {
    name: `${column}, baris ${row}`,
    exact: true,
  });

  await cell.dblclick();
  await page
    .getByRole("textbox", { name: `${column}, baris ${row}`, exact: true })
    .fill(value);
  await page
    .getByRole("textbox", { name: `${column}, baris ${row}`, exact: true })
    .press("Enter");
  await expect(cell).toHaveText(value === "0" ? "0" : value);
  await expect(page.getByText("Tersimpan", { exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  created.set(page, []);
  await signIn(page);
});
test.afterEach(async ({ page }) => {
  for (const id of created.get(page) ?? []) {
    const workspace = await data<{ items: { id: string; revision: number }[] }>(
      await page.request.get(`${backend}/notes`)
    );

    const note = workspace.items.find((item) => item.id === id);
    if (!note)
      throw new Error(
        `Created workspace item ${id} is missing during cleanup.`
      );

    const trashed = await data<{ revision: number }>(
      await page.request.post(`${backend}/notes/items/${id}/trash`, {
        data: { revision: note.revision },
      })
    );

    await data(
      await page.request.post(`${backend}/notes/items/${id}/delete`, {
        data: { revision: trashed.revision },
      })
    );
  }

  created.delete(page);
});
test("typed cells preserve mismatches and clearing while keyboard edits reach saved data", async ({
  page,
}) => {
  const table = await fixture(page);
  await cellEdit(page, "Jumlah", 1, "dua");
  await expect(
    page.getByRole("gridcell", { name: "Jumlah, baris 1", exact: true })
  ).toHaveAttribute("aria-invalid", "true");
  expect((await content(page, table.id)).rows[0]!.cells.quantity).toEqual({
    status: "mismatched",
    raw: "dua",
  });
  await cellEdit(page, "Jumlah", 1, "0");
  const cell = page.getByRole("gridcell", {
    name: "Jumlah, baris 1",
    exact: true,
  });

  await cell.focus();
  await page.keyboard.press("Delete");
  await expect(cell).toHaveText("");
  expect(
    (await content(page, table.id)).rows[0]!.cells.quantity
  ).toBeUndefined();
  await page
    .getByRole("checkbox", { name: "Lunas, baris 1", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Lunas, baris 1", exact: true })
  ).toHaveAttribute("aria-checked", "mixed");
  expect((await content(page, table.id)).rows[0]!.cells.paid).toBeUndefined();
});
test("inline rename cancels with Escape and saves with Enter without a modal", async ({
  page,
}) => {
  await fixture(page);
  await page
    .getByRole("button", { name: "Menu kolom Jumlah", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Ganti nama", exact: true }).click();
  const input = page.getByRole("textbox", {
    name: "Nama kolom Jumlah",
    exact: true,
  });

  await input.fill("Batal");
  await input.press("Escape");
  await expect(
    page.getByRole("button", { name: "Menu kolom Jumlah", exact: true })
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Menu kolom Jumlah", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Ganti nama", exact: true }).click();
  await input.fill("Kuantitas");
  await input.press("Enter");
  await expect(
    page.getByRole("button", { name: "Menu kolom Kuantitas", exact: true })
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Urungkan perubahan", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Menu kolom Jumlah", exact: true })
  ).toBeVisible();
});
test("undo and redo traverse cell edits and type changes in order", async ({
  page,
}) => {
  const table = await fixture(page);
  await page
    .getByRole("button", { name: "Menu kolom Jumlah", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Ubah tipe", exact: true }).hover();
  await page.getByRole("menuitem", { name: "Teks", exact: true }).click();
  await cellEdit(page, "Jumlah", 1, "dua");
  const undo = page.getByRole("button", {
    name: "Urungkan perubahan",
    exact: true,
  });

  await undo.click();
  await expect(
    page.getByRole("gridcell", { name: "Jumlah, baris 1", exact: true })
  ).toHaveText("0");
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(page.getByText("Tersimpan", { exact: true })).toBeVisible();
  const metadata = await data<RecordMetadata>(
    await page.request.get(`${backend}/record-notes/${table.id}/metadata`)
  );

  expect(metadata.columns.find((c) => c.id === "quantity")!.type).toBe(
    "number"
  );
  const redo = page.getByRole("button", {
    name: "Ulangi perubahan",
    exact: true,
  });

  await redo.click();
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(
    page.getByRole("gridcell", { name: "Jumlah, baris 1", exact: true })
  ).toHaveText("dua");
  expect((await content(page, table.id)).rows[0]!.cells.quantity).toEqual({
    raw: "dua",
    value: "dua",
    status: "typed",
  });
});
test("column deletion asks inline and pagination reaches last and previous saved rows", async ({
  page,
}) => {
  await fixture(page);
  await page
    .getByRole("button", { name: "Halaman terakhir", exact: true })
    .click();
  await expect(
    page.getByText("Baris 25–25 dari 25", { exact: true })
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Halaman sebelumnya", exact: true })
    .click();
  await expect(
    page.getByText("Baris 13–24 dari 25", { exact: true })
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Menu kolom Kanal", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Hapus kolom…", exact: true })
    .click();
  await expect(
    page.getByText("Hapus kolom “Kanal”?", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText(
      "Semua isi kolom ini akan dihapus. Anda dapat mengurungkannya setelah dihapus.",
      {
        exact: true,
      }
    )
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Hapus kolom", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Menu kolom Kanal", exact: true })
  ).toHaveCount(0);
});
test("CSV download contains the complete saved table with quotes Unicode zero false and ISO dates", async ({
  page,
}) => {
  await fixture(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh CSV", exact: true }).click();
  const file = await download;
  const path = await file.path();
  if (!path) throw new Error("CSV download missing");
  const csv = await readFile(path, "utf8");
  expect(csv.split("\r\n")).toHaveLength(27);
  expect(csv).toContain('2026-10-01,"Kopi ""susu"", 一",0,12.5,false,Toko\r\n');
});
test("mobile keeps the first data column visible and edits a row in a bottom sheet", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const table = await fixture(page);
  const first = page.getByRole("gridcell", {
    name: "Tanggal, baris 1",
    exact: true,
  });

  await first.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Baris 1", { exact: true })).toBeVisible();
  await dialog.getByLabel("Jumlah", { exact: true }).fill("dua");
  await dialog.getByRole("button", { name: "Selesai", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await content(page, table.id)).rows[0]!.cells.quantity).toEqual({
    raw: "dua",
    status: "mismatched",
  });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= window.innerWidth &&
        document.documentElement.scrollHeight <= window.innerHeight
    )
  ).toBe(true);
});
test("failed saves retain the draft and protect it from navigation until retry succeeds", async ({
  page,
}) => {
  const table = await fixture(page);
  await page.route(`**/record-notes/${table.id}/mutations`, (route) =>
    route.abort("failed")
  );
  const cell = page.getByRole("gridcell", {
    name: "Jumlah, baris 1",
    exact: true,
  });

  await cell.dblclick();
  await page
    .getByRole("textbox", { name: "Jumlah, baris 1", exact: true })
    .fill("99");
  await page
    .getByRole("textbox", { name: "Jumlah, baris 1", exact: true })
    .press("Enter");
  await expect(
    page.getByText("Perubahan belum tersimpan", { exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "Hari ini", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Judul catatan", exact: true })
  ).toHaveValue(table.title);
  await page.unroute(`**/record-notes/${table.id}/mutations`);
  await page
    .getByRole("button", { name: "Coba simpan lagi", exact: true })
    .click();
  await expect(page.getByText("Tersimpan", { exact: true })).toBeVisible();
  expect((await content(page, table.id)).rows[0]!.cells.quantity).toMatchObject(
    { value: "99" }
  );
});

test("export failures offer download recovery without claiming that saved edits failed", async ({
  page,
}) => {
  const table = await fixture(page);
  await page.route(`**/record-notes/${table.id}/export`, (route) =>
    route.abort("failed")
  );
  await page.getByRole("button", { name: "Unduh CSV", exact: true }).click();
  await expect(
    page.getByText("CSV belum dapat diunduh", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("Perubahan belum tersimpan", { exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Coba simpan lagi", exact: true })
  ).toHaveCount(0);
  await expect(page.getByText("Tersimpan", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "../../.impeccable/review/record-notes/desktop-export-error.png",
  });
  await page.unroute(`**/record-notes/${table.id}/export`);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Unduh ulang CSV", exact: true })
    .click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);
  await expect(
    page.getByText("CSV belum dapat diunduh", { exact: true })
  ).toHaveCount(0);
});

test("a failed file transfer is recoverable before the browser leaves the editor", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/record-notes/download/**", (route) =>
    route.abort("failed")
  );
  await page.getByRole("button", { name: "Unduh CSV", exact: true }).click();
  await expect(
    page.getByText("CSV belum dapat diunduh", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Judul catatan", exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("Perubahan belum tersimpan", { exact: true })
  ).toHaveCount(0);
  await page.unroute("**/record-notes/download/**");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Unduh ulang CSV", exact: true })
    .click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);
});

test("retrying a committed creation preserves column identities and creates one table", async ({
  page,
}) => {
  await page.goto("/notes");
  let committed: RecordMetadata | undefined;
  await page.route(`${backend}/record-notes`, async (route) => {
    const response = await route.fetch();
    committed = await data<RecordMetadata>(response);
    created.get(page)!.push(committed.id);
    await route.abort("failed");
  });
  await page
    .getByRole("button", { name: "Buat baru", exact: true })
    .last()
    .click();
  await page
    .getByRole("menuitem", { name: "Buat tabel baru", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Coba lagi");
  await page.unroute(`${backend}/record-notes`);
  if (!committed) throw new Error("The first creation did not commit.");
  const original = committed;
  await page
    .getByRole("button", { name: "Buat baru", exact: true })
    .last()
    .click();
  await page
    .getByRole("menuitem", { name: "Buat tabel baru", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Tambah kolom", exact: true })
  ).toBeEnabled();
  await expect(page).toHaveURL(new RegExp(`note=${original.id}`));
  const saved = await data<RecordMetadata>(
    await page.request.get(`${backend}/record-notes/${original.id}/metadata`)
  );

  expect(saved.columns).toEqual(original.columns);
  expect(saved.revision).toBe(1);
});

test("the header creation menu offers all three actions without the Today shortcut", async ({
  page,
}) => {
  await page.goto("/notes?date=2026-11-02");
  const trigger = page
    .getByRole("button", { name: "Buat baru", exact: true })
    .first();

  await expect(
    page.getByRole("button", { name: "Hari ini", exact: true })
  ).toHaveCount(0);
  await expect(trigger).toBeEnabled();
  await expect(trigger).toHaveCSS("background-image", /linear-gradient/);
  await trigger.focus();
  await trigger.press("ArrowDown");
  await expect(page.getByRole("menuitem")).toHaveText([
    "Buat folder baru",
    "Buat catatan baru",
    "Buat tabel baru",
  ]);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

for (const width of [1280, 390]) {
  test(`the header creates a folder with the name field focused at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/notes?date=2026-11-02");
    await page
      .getByRole("button", { name: "Buat baru", exact: true })
      .first()
      .click();
    await page
      .getByRole("menuitem", { name: "Buat folder baru", exact: true })
      .click();
    const input = page.getByRole("textbox", {
      name: "Nama folder",
      exact: true,
    });

    await expect(input).toBeFocused();
    const title = `Header folder ${randomUUID()}`;
    await input.fill(title);
    const saved = page.waitForResponse(
      (response) =>
        response.url() === `${backend}/notes/items` &&
        response.request().method() === "POST"
    );

    await input.press("Enter");
    const folder = await data<{
      id: string;
      kind: string;
      title: string;
      parentId: string | null;
    }>(await saved);

    created.get(page)!.push(folder.id);
    expect(folder).toMatchObject({ kind: "folder", title, parentId: null });
    await expect(input).toBeHidden();
  });
}

test("the header table action creates a record note", async ({ page }) => {
  await page.goto("/notes?date=2026-11-02");
  await page
    .getByRole("button", { name: "Buat baru", exact: true })
    .first()
    .click();
  const saved = page.waitForResponse(
    (response) =>
      response.url() === `${backend}/record-notes` &&
      response.request().method() === "POST"
  );

  await page
    .getByRole("menuitem", { name: "Buat tabel baru", exact: true })
    .click();
  const table = await data<{
    id: string;
    format: string;
    parentId: string | null;
  }>(await saved);

  created.get(page)!.push(table.id);
  expect(table).toMatchObject({ format: "record", parentId: null });
  await expect(
    page.getByRole("button", { name: "Tambah kolom", exact: true })
  ).toBeEnabled();
  await expect(page).toHaveURL(new RegExp(`note=${table.id}`));
});

test("the primary creation menu opens the rich-text editor after choosing a note", async ({
  page,
}) => {
  await page.goto("/notes");
  await page
    .getByRole("button", { name: "Buat baru", exact: true })
    .first()
    .click();
  await page
    .getByRole("menuitem", { name: "Buat catatan baru", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Isi catatan", exact: true })
  ).toBeVisible();
  await expect(page).toHaveURL(/note=[a-zA-Z0-9_-]+/);
  const id = new URL(page.url()).searchParams.get("note");
  if (!id) throw new Error("The new note has no stable identity.");
  created.get(page)!.push(id);
  const saved = await data<{ format: string }>(
    await page.request.get(`${backend}/notes/items/${id}`)
  );

  expect(saved.format).toBe("rich-text");
});

test("undoing and redoing a column rename preserves columns added afterward", async ({
  page,
}) => {
  const table = await fixture(page);
  await page
    .getByRole("button", { name: "Menu kolom Jumlah", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Ganti nama", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Nama kolom Jumlah", exact: true })
    .fill("Kuantitas");
  await page
    .getByRole("textbox", { name: "Nama kolom Jumlah", exact: true })
    .press("Enter");
  await expect(
    page.getByRole("button", { name: "Menu kolom Kuantitas", exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "Tambah kolom", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Nama kolom Kolom 7", exact: true })
    .press("Escape");
  await cellEdit(page, "Kolom 7", 1, "Keep this value");
  await page
    .getByRole("button", { name: "Urungkan perubahan", exact: true })
    .click();
  await expect(
    page.getByRole("gridcell", { name: "Kolom 7, baris 1", exact: true })
  ).toHaveText("");
  await page
    .getByRole("button", { name: "Urungkan perubahan", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Menu kolom Jumlah", exact: true })
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ulangi perubahan", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Ulangi perubahan", exact: true })
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Ulangi perubahan", exact: true })
    .click();
  await expect(
    page.getByRole("gridcell", { name: "Kolom 7, baris 1", exact: true })
  ).toHaveText("Keep this value");
  const saved = await data<RecordMetadata>(
    await page.request.get(`${backend}/record-notes/${table.id}/metadata`)
  );

  expect(saved.columns).toHaveLength(7);
});

test("a failed metadata load can be retried without masquerading as an empty or unsaved table", async ({
  page,
}) => {
  await page.route("**/record-notes/*/metadata", (route) =>
    route.abort("failed")
  );
  const table = await data<RecordMetadata>(
    await page.request.post(`${backend}/record-notes`, {
      data: {
        title: `Load QA ${randomUUID()}`,
        columns,
        parentId: null,
        requestKey: randomUUID(),
      },
    })
  );

  created.get(page)!.push(table.id);
  await page.goto(`/notes?note=${table.id}`);
  await expect(page.getByRole("alert")).toContainText("Tabel");
  await page.unroute("**/record-notes/*/metadata");
  await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Tambah kolom", exact: true })
  ).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("two editor tabs retain a stale cell draft and merge only its explicit changes", async ({
  page,
}) => {
  const table = await fixture(page);
  const second = await page.context().newPage();
  await second.goto(`/notes?note=${table.id}`);
  await expect(
    second.getByRole("button", { name: "Tambah kolom", exact: true })
  ).toBeEnabled();
  await cellEdit(page, "Jumlah", 1, "99");
  const stale = second.getByRole("gridcell", {
    name: "Jumlah, baris 2",
    exact: true,
  });

  await stale.dblclick();
  await second
    .getByRole("textbox", { name: "Jumlah, baris 2", exact: true })
    .fill("88");
  await second
    .getByRole("textbox", { name: "Jumlah, baris 2", exact: true })
    .press("Enter");
  await expect(
    second.getByText("Perubahan belum tersimpan", { exact: true })
  ).toBeVisible();
  await expect(
    second.getByRole("textbox", { name: "Jumlah, baris 2", exact: true })
  ).toHaveValue("88");
  await second
    .getByRole("button", { name: "Bandingkan versi terbaru", exact: true })
    .click();
  await second
    .getByRole("button", { name: "Terapkan perubahan sel saya", exact: true })
    .click();
  await expect(second.getByText("Tersimpan", { exact: true })).toBeVisible();
  const saved = await content(page, table.id);
  expect(saved.rows[0]!.cells.quantity).toMatchObject({ value: "99" });
  expect(saved.rows[1]!.cells.quantity).toMatchObject({ value: "88" });
  await second.close();
});

test("opening a table reconciles schema and content when another editor saves between reads", async ({
  page,
}) => {
  const table = await fixture(page);
  const sessionId = randomUUID();
  await data(
    await page.request.post(`${backend}/notes/presence/acquire`, {
      data: { ref: `custom:${table.id}`, sessionId },
    })
  );
  await page.route(
    `**/record-notes/${table.id}/content`,
    async (route) => {
      const current = await data<RecordMetadata>(
        await page.request.get(`${backend}/record-notes/${table.id}/metadata`)
      );

      await data(
        await page.request.post(
          `${backend}/record-notes/${table.id}/mutations`,
          {
            data: {
              revision: current.revision,
              sessionId,
              requestKey: randomUUID(),
              change: { action: "context", description: "Changed during load" },
            },
          }
        )
      );
      await route.continue();
    },
    { times: 1 }
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Tambah kolom", exact: true })
  ).toBeEnabled();
  await expect(
    page.getByRole("textbox", { name: "Deskripsi catatan", exact: true })
  ).toHaveValue("Changed during load");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await data(
    await page.request.post(`${backend}/notes/presence/release`, {
      data: { ref: `custom:${table.id}`, sessionId },
    })
  );
});

test("cell selection has a visible outline and arrows move the active cell", async ({
  page,
}) => {
  await fixture(page);
  const start = page.getByRole("gridcell", {
    name: "Produk, baris 1",
    exact: true,
  });

  await start.click();
  await expect(start).toBeFocused();
  await expect(start).toHaveCSS("outline-style", "solid");
  await expect(start).toHaveCSS("outline-width", "2px");
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("gridcell", { name: "Jumlah, baris 1", exact: true })
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("gridcell", { name: "Jumlah, baris 2", exact: true })
  ).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowUp");
  await expect(start).toBeFocused();
});

test("typing replaces a cell, Escape cancels, and Tab commits to the adjacent cell", async ({
  page,
}) => {
  const table = await fixture(page);
  const start = page.getByRole("gridcell", {
    name: "Produk, baris 1",
    exact: true,
  });

  await start.click();
  await page.keyboard.type("Dibatalkan");
  await page.keyboard.press("Escape");
  await expect(start).toBeFocused();
  await expect(start).toHaveText('Kopi "susu", 一');
  expect((await content(page, table.id)).rows[0]!.cells.product!.raw).toBe(
    'Kopi "susu", 一'
  );
  await page.keyboard.type("Teh");
  await page.keyboard.press("Tab");
  const quantity = page.getByRole("gridcell", {
    name: "Jumlah, baris 1",
    exact: true,
  });

  await expect(quantity).toBeFocused();
  expect((await content(page, table.id)).rows[0]!.cells.product!.raw).toBe(
    "Teh"
  );
  await page.keyboard.press("F2");
  await page
    .getByRole("textbox", { name: "Jumlah, baris 1", exact: true })
    .fill("42");
  await page.keyboard.press("Shift+Tab");
  await expect(start).toBeFocused();
  expect((await content(page, table.id)).rows[0]!.cells.quantity!.raw).toBe(
    "42"
  );
});

test("Shift arrows and pointer dragging select ranges that clear atomically", async ({
  page,
}) => {
  const table = await fixture(page);
  const start = page.getByRole("gridcell", {
    name: "Produk, baris 1",
    exact: true,
  });

  await start.click();
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(
    page.locator('[data-record-cell][aria-selected="true"]')
  ).toHaveCount(4);
  await page.keyboard.press("Delete");
  await expect(start).toHaveText("");
  await expect(page.getByText("Tersimpan", { exact: true })).toBeVisible();
  const saved = await content(page, table.id);
  expect(saved.rows[0]!.cells.product).toBeUndefined();
  expect(saved.rows[0]!.cells.quantity).toBeUndefined();
  expect(saved.rows[1]!.cells.product).toBeUndefined();
  expect(saved.rows[1]!.cells.quantity).toBeUndefined();
  expect(saved.rows[0]!.cells.price!.raw).toBe("12.5");
  const end = page.getByRole("gridcell", {
    name: "Harga, baris 3",
    exact: true,
  });

  const a = await start.boundingBox();
  const b = await end.boundingBox();
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();
  await page.mouse.move(a!.x + 10, a!.y + 10);
  await page.mouse.down();
  await page.mouse.move(b!.x + 10, b!.y + 10, { steps: 8 });
  await page.mouse.up();
  await expect(
    page.locator('[data-record-cell][aria-selected="true"]')
  ).toHaveCount(9);
});

test("grid boundaries allow keyboard exit and new pages retain a keyboard entry cell", async ({
  page,
}) => {
  await fixture(page);
  await page
    .getByRole("gridcell", { name: "Tanggal, baris 1", exact: true })
    .click();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("button", {
      name: "Pilih semua baris halaman ini",
      exact: true,
    })
  ).toBeFocused();
  await page
    .getByRole("gridcell", { name: "Kanal, baris 12", exact: true })
    .click();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Baris baru", exact: true })
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Halaman berikutnya", exact: true })
    .click();
  await expect(
    page.getByRole("gridcell", { name: "Tanggal, baris 13", exact: true })
  ).toHaveAttribute("tabindex", "0");
});

test("Ctrl Z undoes saved cell edits and Ctrl Shift Z redoes them", async ({
  page,
}) => {
  const table = await fixture(page);
  await cellEdit(page, "Produk", 1, "Teh baru");
  await page
    .getByRole("gridcell", { name: "Produk, baris 1", exact: true })
    .click();
  await page.keyboard.press("Control+z");
  await expect(
    page.getByRole("gridcell", { name: "Produk, baris 1", exact: true })
  ).toHaveText('Kopi "susu", 一');
  expect((await content(page, table.id)).rows[0]!.cells.product!.raw).toBe(
    'Kopi "susu", 一'
  );
  await page.keyboard.press("Control+Shift+z");
  await expect(
    page.getByRole("gridcell", { name: "Produk, baris 1", exact: true })
  ).toHaveText("Teh baru");
  expect((await content(page, table.id)).rows[0]!.cells.product!.raw).toBe(
    "Teh baru"
  );
});

test("undo restores a cleared rectangle as one edit and a new edit discards redo", async ({
  page,
}) => {
  const table = await fixture(page);
  const first = page.getByRole("gridcell", {
    name: "Produk, baris 1",
    exact: true,
  });

  await first.click();
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Delete");
  await expect(first).toHaveText("");
  await expect(page.getByText("Tersimpan", { exact: true })).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(first).toHaveText('Kopi "susu", 一');
  const saved = await content(page, table.id);
  expect(saved.rows[0]!.cells.quantity!.raw).toBe("0");
  expect(saved.rows[1]!.cells.quantity!.raw).toBe("1");
  expect(saved.rows[1]!.cells.product!.raw).toBe("Roti gandum");
  await cellEdit(page, "Produk", 1, "Cabang baru");
  await expect(
    page.getByRole("button", { name: "Ulangi perubahan", exact: true })
  ).toBeDisabled();
});

test("a failed undo can be retried without losing redo or adding duplicate history", async ({
  page,
}) => {
  const table = await fixture(page);
  await cellEdit(page, "Produk", 1, "Teh baru");
  await page.route(
    `**/record-notes/${table.id}/mutations`,
    (route) => route.abort("failed"),
    { times: 1 }
  );
  await page
    .getByRole("gridcell", { name: "Produk, baris 1", exact: true })
    .click();
  await page.keyboard.press("Control+z");
  await expect(
    page.getByRole("button", { name: "Coba simpan lagi", exact: true })
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Coba simpan lagi", exact: true })
    .click();
  await expect(
    page.getByRole("gridcell", { name: "Produk, baris 1", exact: true })
  ).toHaveText('Kopi "susu", 一');
  await expect(
    page.getByRole("button", { name: "Urungkan perubahan", exact: true })
  ).toBeDisabled();
  await page
    .getByRole("gridcell", { name: "Produk, baris 1", exact: true })
    .click();
  await page.keyboard.press("Control+y");
  await expect(
    page.getByRole("gridcell", { name: "Produk, baris 1", exact: true })
  ).toHaveText("Teh baru");
  expect((await content(page, table.id)).rows[0]!.cells.product!.raw).toBe(
    "Teh baru"
  );
});

test("Ctrl Z inside a cell input keeps native text undo", async ({ page }) => {
  const table = await fixture(page);
  await page
    .getByRole("gridcell", { name: "Produk, baris 1", exact: true })
    .dblclick();
  const input = page.getByRole("textbox", {
    name: "Produk, baris 1",
    exact: true,
  });

  await input.press("End");
  await page.keyboard.type("x");
  await input.press("Control+z");
  await expect(input).toHaveValue('Kopi "susu", 一');
  await input.press("Escape");
  expect((await content(page, table.id)).rows[0]!.cells.product!.raw).toBe(
    'Kopi "susu", 一'
  );
});

test("column removal matches the warning design and highlights only its target until dismissed", async ({
  page,
}) => {
  await fixture(page);
  const trigger = page.getByRole("button", {
    name: "Menu kolom Kanal",
    exact: true,
  });

  await trigger.click();
  await page
    .getByRole("menuitem", { name: "Hapus kolom…", exact: true })
    .click();
  const remove = page.getByRole("button", { name: "Hapus kolom", exact: true });
  await expect(remove).toHaveCSS("background-image", "none");
  await expect(remove).toHaveCSS("background-color", "rgb(192, 54, 44)");
  await expect(remove).toHaveCSS("height", "32px");
  const popup = page.locator('[data-slot="dropdown-menu-content"]');
  await expect(popup).toHaveCSS("width", "260px");
  await expect(popup).toHaveCSS("border-radius", "10px");
  await expect(
    page.locator(
      '[data-record-cell][aria-selected="true"][aria-label^="Kanal,"]'
    )
  ).toHaveCount(12);
  await expect(
    page.locator('[data-record-cell][aria-selected="true"]')
  ).toHaveCount(12);
  const cell = page.getByRole("gridcell", {
    name: "Kanal, baris 12",
    exact: true,
  });

  await expect(cell).toHaveCSS("box-shadow", /192, 54, 44/);
  const cancel = page.getByRole("button", { name: "Batal", exact: true });
  await expect(cancel).toBeFocused();
  await expect(cancel).toHaveCSS("outline-style", "solid");
  await expect(cancel).toHaveCSS("outline-width", "2px");
  await cancel.click();
  await expect(remove).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(
    page.locator('[data-record-cell][aria-selected="true"]')
  ).toHaveCount(0);
  await trigger.click();
  await page
    .getByRole("menuitem", { name: "Hapus kolom…", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(remove).not.toBeVisible();
  await expect(
    page.locator('[data-record-cell][aria-selected="true"]')
  ).toHaveCount(0);
});

test("removed columns undo with values across pages and undo itself has no toast", async ({
  page,
}) => {
  const table = await fixture(page);
  await page
    .getByRole("button", { name: "Menu kolom Jumlah", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Hapus kolom…", exact: true })
    .click();
  await page.getByRole("button", { name: "Hapus kolom", exact: true }).click();
  await expect(
    page.getByText("Kolom “Jumlah” dihapus", { exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "Urungkan", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Menu kolom Jumlah", exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("Perubahan diurungkan", { exact: true })
  ).toHaveCount(0);
  const saved = await content(page, table.id);
  expect(saved.rows).toHaveLength(25);
  expect(saved.rows[0]!.cells.quantity!.raw).toBe("0");
  expect(saved.rows[24]!.cells.quantity!.raw).toBe("24");
  expect(saved.rows[0]!.cells.product!.raw).toBe('Kopi "susu", 一');
  await page
    .getByRole("gridcell", { name: "Jumlah, baris 1", exact: true })
    .click();
  await page.keyboard.press("Control+Shift+z");
  await expect(
    page.getByRole("button", { name: "Menu kolom Jumlah", exact: true })
  ).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(
    page.getByRole("button", { name: "Menu kolom Jumlah", exact: true })
  ).toBeVisible();
  expect((await content(page, table.id)).rows[24]!.cells.quantity!.raw).toBe(
    "24"
  );
});
