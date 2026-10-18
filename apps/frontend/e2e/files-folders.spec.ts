import { randomUUID } from "node:crypto";
import { expect, test, type Page, type APIResponse } from "@playwright/test";
import type {
  DeletionOperation,
  LibraryItem,
} from "../src/lib/services/api/file-library/file-library.api";
import { filePreviewImage, filePreviewPdf } from "./file-preview-fixtures";

const backend = process.env.PLAYWRIGHT_BACKEND_URL ?? "http://localhost:5000";

async function payload<T>(response: APIResponse): Promise<T> {
  expect(
    response.ok(),
    `HTTP ${response.status()} from ${response.url()}: ${await response.text()}`
  ).toBe(true);

  return (await response.json()).data as T;
}

async function account(page: Page, origin: string) {
  const result = await page.request.post(`${backend}/api/auth/sign-up/email`, {
    headers: { Origin: origin },
    data: {
      name: "Files workspace test",
      email: `files-${randomUUID()}@example.test`,
      password: "Files-workspace-QA-2026!",
    },
  });

  expect(
    result.ok(),
    `Account setup HTTP ${result.status()}: ${await result.text()}`
  ).toBe(true);
  await payload(
    await page.request.patch(`${backend}/users/me`, {
      data: {
        name: "Files workspace test",
        locale: "id",
        timezone: "Asia/Makassar",
        onboardingCompleted: true,
      },
    })
  );
}

async function waitForWorkspace(page: Page) {
  await expect(
    page.getByRole("button", { name: "Folder baru", exact: true })
  ).toBeEnabled({ timeout: 30_000 });
}

async function folder(
  page: Page,
  name: string,
  parentId: string | null = null
) {
  return payload<{ id: string; name: string; revision: number }>(
    await page.request.post(`${backend}/file-library/folders`, {
      data: { name, parentId },
    })
  );
}

async function paginatedFolders(page: Page) {
  // This fixture exercises pagination; concurrency has separate database tests.
  // Serial setup avoids exhausting the API connection pool with 51 owner locks.
  for (let index = 0; index < 51; index++)
    await folder(page, `Folder ${String(index).padStart(3, "0")}`);
}

function visualItems(): LibraryItem[] {
  const common = {
    revision: 1,
    parentId: null,
    createdAt: "2026-10-18T04:00:00Z",
    deletingOperationId: null,
    path: [],
  };

  return [
    ...["Belajar", "Kerja", "Pribadi"].map((name, index): LibraryItem => ({
      ...common,
      id: `visual-folder-${index}`,
      name,
      kind: "folder",
      size: null,
      mimeType: null,
      fileKind: null,
      status: null,
      childCount: 12,
    })),
    ...[
      { name: "Catatan rapat.pdf", status: "ready", fileKind: "document" },
      {
        name: "Invoice Oktober.pdf",
        status: "processing",
        fileKind: "document",
      },
      { name: "Rekaman wawancara.mp3", status: "failed", fileKind: "audio" },
      { name: "Foto catatan.jpg", status: "ready", fileKind: "image" },
      {
        name: `Laporan-${"panjang".repeat(30)}.pdf`,
        status: "ready",
        fileKind: "document",
      },
    ].map((file, index): LibraryItem => ({
      ...common,
      ...file,
      id: `visual-file-${index}`,
      kind: "file",
      size: 245760,
      mimeType: "application/octet-stream",
      childCount: null,
    })),
  ];
}

test.describe("Files and folders", () => {
  test.setTimeout(90_000);
  test.beforeEach(async ({ page, baseURL }) => {
    await account(page, baseURL!);
  });

  test("creates nested folders and keeps location through refresh and browser history", async ({
    page,
  }) => {
    await page.goto("/files");
    await waitForWorkspace(page);
    await page
      .getByRole("button", { name: "Folder baru", exact: true })
      .click();
    await page.getByRole("textbox", { name: "Nama folder" }).fill("Kerja");
    await page
      .getByRole("button", { name: "Buat folder", exact: true })
      .click();
    await page.getByRole("link", { name: "Kerja", exact: true }).click();
    await expect(page).toHaveURL(/folder=/);
    await page
      .getByRole("button", { name: "Folder baru", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Nama folder" })
      .fill("Proyek Sydia");
    await page
      .getByRole("button", { name: "Buat folder", exact: true })
      .click();
    await page.getByRole("link", { name: "Proyek Sydia", exact: true }).click();
    await page.reload();
    await waitForWorkspace(page);
    await expect(
      page.getByRole("navigation", { name: "Lokasi file" })
    ).toContainText("Proyek Sydia");
    await page.goBack();
    await expect(
      page.getByRole("link", { name: "Proyek Sydia", exact: true })
    ).toBeVisible();
  });

  test("preserves selection when switching between list and grid", async ({
    page,
  }) => {
    await folder(page, "Belajar");
    await folder(page, "Kerja");
    await page.goto("/files");
    await waitForWorkspace(page);
    await page
      .getByRole("checkbox", { name: "Pilih Belajar", exact: true })
      .check();
    await page.getByRole("button", { name: "Tampilan kisi" }).click();
    await expect(
      page.getByRole("checkbox", { name: "Pilih Belajar", exact: true })
    ).toBeChecked();
    await expect(page.getByText("1 dipilih", { exact: true })).toBeVisible();
    await page.reload();
    await waitForWorkspace(page);
    await expect(
      page.getByRole("button", { name: "Tampilan kisi" })
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("global name search exposes a path and opens the containing location", async ({
    page,
  }) => {
    const work = await folder(page, "Kerja");
    await folder(page, "Invoice", work.id);
    await page.goto("/files");
    await waitForWorkspace(page);
    await page
      .getByRole("textbox", { name: "Cari nama file atau folder" })
      .fill("invoice");
    await page
      .getByRole("textbox", { name: "Cari nama file atau folder" })
      .press("Enter");
    await expect(
      page.getByText("Hasil di semua folder", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText("1 hasil untuk “invoice”", { exact: true })
    ).toBeVisible();
    await expect(page.locator(".files-item-path")).toHaveText(
      "File saya / Kerja"
    );
    await expect(
      page.getByRole("link", { name: "Buka lokasi Invoice" })
    ).toHaveText("Buka lokasi");
    await expect(page.locator(".files-list-heading")).toHaveCount(0);
    await page.getByRole("link", { name: "Buka lokasi Invoice" }).click();
    await expect(page).toHaveURL(new RegExp(`folder=${work.id}`));
    await expect(
      page.getByRole("link", { name: "Invoice", exact: true })
    ).toBeVisible();
  });

  test("moves a selection through the destination picker", async ({ page }) => {
    const work = await folder(page, "Kerja");
    await folder(page, "Belajar");
    await page.goto("/files");
    await waitForWorkspace(page);
    await page
      .getByRole("checkbox", { name: "Pilih Belajar", exact: true })
      .check();
    await page.getByRole("button", { name: /^Pindahkan(?: ke…)?$/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Kerja", exact: true }).click();
    await dialog.getByRole("button", { name: "Pindahkan ke sini" }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole("link", { name: "Kerja", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`folder=${work.id}`));
    await expect(
      page.getByRole("link", { name: "Belajar", exact: true })
    ).toBeVisible();
  });

  test("duplicate folder errors preserve the entered name", async ({
    page,
  }) => {
    await folder(page, "Kerja");
    await page.goto("/files");
    await waitForWorkspace(page);
    await page
      .getByRole("button", { name: "Folder baru", exact: true })
      .click();
    await page.getByRole("textbox", { name: "Nama folder" }).fill("kerja");
    await page
      .getByRole("button", { name: "Buat folder", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("sudah ada");
    await expect(
      page.getByRole("textbox", { name: "Nama folder" })
    ).toHaveValue("kerja");
  });

  test("recursive deletion requires confirmation and survives a refresh", async ({
    page,
  }) => {
    const work = await folder(page, "Kerja");
    await folder(page, "Proyek", work.id);
    await page.goto("/files");
    await waitForWorkspace(page);
    await page
      .getByRole("checkbox", { name: "Pilih Kerja", exact: true })
      .check();
    await page.getByRole("button", { name: /^Hapus(?: permanen)?$/ }).click();
    await expect(page.getByRole("dialog")).toContainText("0 file dan 2 folder");
    await page.getByRole("button", { name: "Batal", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "Kerja", exact: true })
    ).toBeVisible();
    await page.getByRole("button", { name: /^Hapus(?: permanen)?$/ }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Hapus permanen", exact: true })
      .click();
    await page.reload();
    await waitForWorkspace(page);
    await expect(
      page.getByText("Penghapusan selesai", { exact: true })
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("link", { name: "Kerja", exact: true })
    ).not.toBeVisible();
  });
  test("desktop drag moves the complete selection into a folder", async ({
    page,
  }) => {
    await folder(page, "Alpha");
    await folder(page, "Beta");
    await folder(page, "Target");
    await page.goto("/files");
    await waitForWorkspace(page);
    await page
      .getByRole("checkbox", { name: "Pilih Alpha", exact: true })
      .check();
    await page
      .getByRole("checkbox", { name: "Pilih Beta", exact: true })
      .check();
    const source = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("link", { name: "Alpha", exact: true }) });

    const target = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("link", { name: "Target", exact: true }) });

    await source.dragTo(target);
    await expect(
      page.getByRole("link", { name: "Alpha", exact: true })
    ).not.toBeVisible();
    await page.getByRole("link", { name: "Target", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "Alpha", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Beta", exact: true })
    ).toBeVisible();
  });

  test("an old direct link to a deleted subtree opens the surviving parent", async ({
    page,
  }) => {
    const parent = await folder(page, "Parent");
    const removed = await folder(page, "Removed", parent.id);
    const child = await folder(page, "Child", removed.id);
    const preview = await payload<{ id: string }>(
      await page.request.post(`${backend}/file-library/delete-previews`, {
        data: {
          items: [
            { kind: "folder", id: removed.id, revision: removed.revision },
          ],
        },
      })
    );

    const operation = await payload<{ id: string }>(
      await page.request.post(`${backend}/file-library/deletions`, {
        data: { previewId: preview.id, idempotencyKey: randomUUID() },
      })
    );

    await expect
      .poll(
        async () =>
          (
            await payload<{ status: string }>(
              await page.request.get(
                `${backend}/file-library/deletions/${operation.id}`
              )
            )
          ).status
      )
      .toBe("completed");
    await page.goto(`/files?folder=${child.id}`);
    await waitForWorkspace(page);
    await expect(page).toHaveURL(new RegExp(`folder=${parent.id}`));
    await expect(page.getByRole("status")).toContainText(
      "Folder telah dihapus"
    );
  });

  test("multi-file upload keeps the captured folder and retries only the failed file", async ({
    page,
  }) => {
    const work = await folder(page, "Kerja");
    await page.goto(`/files?folder=${work.id}`);
    await waitForWorkspace(page);
    await expect(
      page.getByRole("button", { name: "Unggah file", exact: true })
    ).toBeEnabled();
    const destinations: string[] = [];
    const names: string[] = [];
    let firstAttempt = true;
    await page.route(`${backend}/documents`, async (route) => {
      const body = route.request().postData() ?? "";
      destinations.push(body);
      const failed = body.includes('filename="retry.txt"');
      names.push(failed ? "retry.txt" : "success.txt");

      if (failed && firstAttempt) {
        firstAttempt = false;
        await route.fulfill({
          status: 503,
          json: {
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "Penyimpanan sedang tidak tersedia.",
              details: {},
            },
          },
        });
      } else {
        await route.fulfill({
          json: { data: { id: randomUUID(), status: "processing" } },
        });
      }
    });
    await page.locator('input[type="file"]').setInputFiles([
      {
        name: "success.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Synthetic successful upload"),
      },
      {
        name: "retry.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Synthetic retried upload"),
      },
    ]);
    await expect(
      page.getByText("Penyimpanan sedang tidak tersedia.", { exact: true })
    ).toBeVisible();
    await page.getByRole("link", { name: "File saya", exact: true }).click();
    await page
      .getByRole("button", { name: "Coba ulang unggahan gagal" })
      .click();
    await expect.poll(() => names.length).toBe(3);
    expect(names).toEqual(["success.txt", "retry.txt", "retry.txt"]);
    expect(destinations.every((body) => body.includes(work.id))).toBe(true);
    await expect(
      page.getByRole("button", { name: "Coba ulang unggahan gagal" })
    ).not.toBeVisible();
  });

  test("authenticated API boundaries reject another user's folders and deletion receipts", async ({
    page,
    browser,
    baseURL,
  }) => {
    const owned = await folder(page, "Private");
    const preview = await payload<{ id: string }>(
      await page.request.post(`${backend}/file-library/delete-previews`, {
        data: {
          items: [{ kind: "folder", id: owned.id, revision: owned.revision }],
        },
      })
    );

    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    await account(other, baseURL!);
    expect(
      (
        await other.request.get(`${backend}/file-library/folders/${owned.id}`)
      ).status()
    ).toBe(404);
    expect(
      (
        await other.request.get(
          `${backend}/file-library/items?folderId=${owned.id}`
        )
      ).status()
    ).toBe(404);
    expect(
      (
        await other.request.patch(
          `${backend}/file-library/folders/${owned.id}`,
          { data: { name: "Stolen", revision: owned.revision } }
        )
      ).status()
    ).toBe(404);
    expect(
      (
        await other.request.post(`${backend}/file-library/folders`, {
          data: { name: "Child", parentId: owned.id },
        })
      ).status()
    ).toBe(404);
    expect(
      (
        await other.request.post(`${backend}/file-library/moves`, {
          data: {
            items: [{ kind: "folder", id: owned.id, revision: owned.revision }],
            destinationId: null,
          },
        })
      ).status()
    ).toBe(404);
    expect(
      (
        await other.request.post(`${backend}/file-library/deletions`, {
          data: { previewId: preview.id, idempotencyKey: randomUUID() },
        })
      ).status()
    ).toBe(404);
    expect(
      (
        await other.request.get(
          `${backend}/file-library/deletions/${preview.id}`
        )
      ).status()
    ).toBe(404);
    expect(
      (
        await other.request.get(
          `${backend}/file-library/deletions/${preview.id}/failures`
        )
      ).status()
    ).toBe(404);
    expect(
      (
        await other.request.post(
          `${backend}/file-library/deletions/${preview.id}/retry`,
          { data: {} }
        )
      ).status()
    ).toBe(404);
    expect(
      (
        await other.request.post(
          `${backend}/file-library/deletions/${preview.id}/retry-preview`
        )
      ).status()
    ).toBe(404);
    await otherContext.close();
  });

  test("selection spans pages and the move picker works with the keyboard", async ({
    page,
  }) => {
    await paginatedFolders(page);
    await page.goto("/files");
    await waitForWorkspace(page);
    await page
      .getByRole("checkbox", { name: "Pilih Folder 000", exact: true })
      .focus();
    await page.keyboard.press("Space");
    await page.getByRole("button", { name: "Berikutnya", exact: true }).click();
    await page
      .getByRole("checkbox", { name: "Pilih Folder 050", exact: true })
      .check();
    await expect(page.getByText("2 dipilih", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Tampilan kisi" }).click();
    await page.getByRole("button", { name: /^Pindahkan(?: ke…)?$/ }).focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("button", { name: "Folder 000", exact: true })
    ).toBeDisabled();
    await dialog
      .getByRole("button", { name: "Folder 001", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(
      dialog.getByRole("button", { name: "Pindahkan ke sini" })
    ).toBeEnabled();
    await dialog.getByRole("button", { name: "Pindahkan ke sini" }).focus();
    await page.keyboard.press("Enter");
    await expect(dialog).not.toBeVisible();
    await expect(page).not.toHaveURL(/offset=50/);
    await page.getByRole("link", { name: "Folder 001", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "Folder 000", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Folder 050", exact: true })
    ).toBeVisible();
  });

  test("unavailable folders recover to root and an empty search keeps navigation usable", async ({
    page,
  }) => {
    await page.goto("/files?folder=unavailable-private-folder");
    await expect(
      page.getByRole("button", { name: "Kembali ke File saya" })
    ).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Kembali ke File saya" }).click();
    await expect(page).toHaveURL(/\/files$/);
    await waitForWorkspace(page);
    await expect(
      page.getByRole("heading", { name: "Belum ada file", exact: true })
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Cari nama file atau folder" })
      .fill("Tidak ada hasil");
    await page
      .getByRole("textbox", { name: "Cari nama file atau folder" })
      .press("Enter");
    await expect(
      page.getByRole("list", { name: "File dan folder" }).getByRole("listitem")
    ).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Lokasi file" })
    ).toContainText("File saya");
    await expect(
      page.getByRole("button", { name: "Folder baru", exact: true })
    ).toBeEnabled();
    await expect(page.getByRole("tree")).toHaveCount(0);
  });

  test("partial deletion shows failures and requires a fresh confirmation after membership changes", async ({
    page,
  }) => {
    let operation: DeletionOperation = {
      id: "partial-operation",
      status: "partial",
      selection: [],
      files: { total: 10, completed: 8, failed: 2, pending: 0 },
      folders: { total: 1, completed: 0, failed: 0, pending: 0, retained: 1 },
    };

    const retryBodies: unknown[] = [];
    await page.route("**/file-library/deletions**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;

      if (path.endsWith("/failures")) {
        await route.fulfill({
          json: {
            data: [
              {
                itemId: "failed-a",
                kind: "file",
                name: "Invoice A.pdf",
                state: "failed",
                error: "Penyimpanan tidak dapat dibersihkan.",
              },
              {
                itemId: "failed-b",
                kind: "file",
                name: "Invoice B.pdf",
                state: "failed",
                error: "Penyimpanan tidak dapat dibersihkan.",
              },
            ],
            pagination: { total: 2, offset: 0, limit: 10 },
          },
        });

        return;
      }

      if (path.endsWith("/retry-preview")) {
        await route.fulfill({
          json: {
            data: {
              ...operation,
              id: "renewed-confirmation",
              status: "preview",
              files: { total: 3, completed: 0, failed: 0, pending: 3 },
              folders: {
                total: 1,
                completed: 0,
                failed: 0,
                pending: 1,
                retained: 0,
              },
            },
          },
        });

        return;
      }

      if (path.endsWith("/retry")) {
        const body: unknown = request.postDataJSON();
        retryBodies.push(body);

        if (retryBodies.length === 1) {
          await route.fulfill({
            status: 409,
            json: {
              error: {
                code: "CONFLICT",
                message: "Isi pilihan telah berubah.",
                details: { reason: "stale_confirmation" },
              },
            },
          });

          return;
        }

        operation = {
          ...operation,
          status: "completed",
          files: { total: 11, completed: 11, failed: 0, pending: 0 },
          folders: {
            total: 1,
            completed: 1,
            failed: 0,
            pending: 0,
            retained: 0,
          },
        };
        await route.fulfill({ json: { data: operation } });

        return;
      }

      await route.fulfill({
        json: {
          data: [operation],
          pagination: { total: 1, offset: 0, limit: 10 },
        },
      });
    });
    await page.goto("/files");
    await waitForWorkspace(page);
    await expect(
      page.getByText("Invoice A.pdf", { exact: true })
    ).toBeVisible();
    await page.screenshot({ path: "/tmp/sydia-files-final-partial.png" });
    await page.reload();
    await waitForWorkspace(page);
    await page.getByRole("button", { name: "Coba ulang item gagal" }).click();
    await page.getByRole("button", { name: "Periksa item tersisa" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("3 file dan 1 folder");
    await dialog.getByRole("button", { name: "Batal", exact: true }).click();
    expect(retryBodies).toEqual([{}]);
    await page.getByRole("button", { name: "Periksa item tersisa" }).click();
    await dialog
      .getByRole("button", { name: "Hapus permanen", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Penghapusan selesai", exact: true })
    ).toBeVisible();
    expect(retryBodies).toEqual([{}, { previewId: "renewed-confirmation" }]);
  });

  test("populated list and grid expose the same items and remain contained on mobile", async ({
    page,
  }) => {
    const items = visualItems();
    await page.route("**/documents/visual-file-*/content", (route) =>
      route.fulfill({
        contentType: route.request().url().includes("visual-file-3/")
          ? "image/svg+xml"
          : "application/pdf",
        body: route.request().url().includes("visual-file-3/")
          ? filePreviewImage
          : filePreviewPdf(),
        headers: {
          "Access-Control-Allow-Origin": new URL(page.url()).origin,
          "Access-Control-Allow-Credentials": "true",
        },
      })
    );
    await page.route("**/file-library/items?**", (route) =>
      route.fulfill({
        json: { data: items, pagination: { total: 8, offset: 0, limit: 50 } },
      })
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/files");
    await waitForWorkspace(page);
    const list = page.getByRole("list", { name: "File dan folder" });
    await expect(list.getByRole("listitem")).toHaveCount(8);
    await expect(list.getByRole("img")).toHaveCount(0);
    // Literal dimensions come from the approved 1440px Penpot list board.
    await expect(page.locator(".files-header")).toHaveCSS("height", "80px");
    await expect(list.getByRole("listitem").first()).toHaveCSS(
      "height",
      "64px"
    );
    await expect
      .poll(() =>
        list
          .getByRole("listitem")
          .first()
          .evaluate((element) => element.getBoundingClientRect().y)
      )
      .toBe(280);
    await page.screenshot({
      path: "/tmp/sydia-files-final-populated-list.png",
    });
    await page
      .getByRole("checkbox", { name: "Pilih Belajar", exact: true })
      .check();
    await page.getByRole("button", { name: "Tampilan kisi" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(8);
    await expect(
      page.getByRole("checkbox", { name: "Pilih Belajar", exact: true })
    ).toBeChecked();
    await expect(list.getByRole("listitem").first()).toHaveCSS(
      "height",
      "80px"
    );
    await expect(
      list.getByRole("listitem").filter({
        has: page.getByRole("link", {
          name: "Catatan rapat.pdf",
          exact: true,
        }),
      })
    ).toHaveCSS("height", "240px");
    await expect
      .poll(() =>
        page
          .locator(".files-grid-items")
          .last()
          .evaluate(
            (element) =>
              getComputedStyle(element).gridTemplateColumns.split(" ").length
          )
      )
      .toBe(5);
    const pdf = page.getByRole("img", {
      name: "Pratinjau Catatan rapat.pdf",
      exact: true,
    });

    await expect
      .poll(() =>
        pdf.evaluate((element: HTMLCanvasElement) => {
          const pixels = element
            .getContext("2d")!
            .getImageData(0, 0, element.width, element.height).data;

          return pixels.some(
            (value, index) =>
              index % 4 === 0 && pixels[index + 3] === 255 && value < 100
          );
        })
      )
      .toBe(true);
    await expect(
      page.getByRole("img", { name: "Pratinjau Foto catatan.jpg" })
    ).toBeVisible();
    await expect(list.getByRole("status")).toHaveCount(0);
    await expect(list.getByText("Pratinjau tidak tersedia")).toHaveCount(0);
    await expect(
      page.getByText("Gagal diproses", { exact: true })
    ).toBeVisible();
    await page.screenshot({
      path: "/tmp/sydia-files-final-populated-grid.png",
    });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect
      .poll(() =>
        page
          .locator(".files-grid-items")
          .last()
          .evaluate(
            (element) =>
              getComputedStyle(element).gridTemplateColumns.split(" ").length
          )
      )
      .toBe(5);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page
          .getByRole("main")
          .evaluate((element) => element.getBoundingClientRect().x)
      )
      .toBe(0);
    await expect(
      page.getByRole("button", { name: "Tampilan daftar" })
    ).toBeInViewport();
    await expect(
      page.getByRole("button", { name: "Tampilan kisi" })
    ).toBeInViewport();
    await expect(list.getByRole("listitem").first()).toHaveCSS(
      "height",
      "80px"
    );
    await expect(
      list.getByRole("listitem").filter({
        has: page.getByRole("link", { name: "Catatan rapat.pdf", exact: true }),
      })
    ).toHaveCSS("height", "216px");
    await expect(page.locator(".files-grid-items").last()).toHaveCSS(
      "grid-template-columns",
      "169px 169px"
    );
    await expect
      .poll(() =>
        list
          .getByRole("listitem")
          .first()
          .evaluate((element) => element.getBoundingClientRect().y)
      )
      .toBe(308);
    await page.screenshot({
      path: "/tmp/sydia-files-final-populated-mobile.png",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    await expect(page.getByRole("tree")).toHaveCount(0);
  });

  test("a failed image preview keeps the file selectable and openable", async ({
    page,
  }) => {
    const image = visualItems().find((item) => item.fileKind === "image")!;
    const warnings: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "warning") warnings.push(message.text());
    });
    await page.route("**/file-library/items?**", (route) =>
      route.fulfill({
        json: { data: [image], pagination: { total: 1, offset: 0, limit: 50 } },
      })
    );
    await page.route("**/documents/visual-file-3/content", (route) =>
      route.fulfill({ status: 503 })
    );
    await page.goto("/files");
    await waitForWorkspace(page);
    await page.getByRole("button", { name: "Tampilan kisi" }).click();

    await expect(
      page.getByText("Pratinjau tidak tersedia", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Buka Foto catatan.jpg", exact: true })
    ).toHaveAttribute("href", `${backend}/documents/visual-file-3/content`);
    await page
      .getByRole("checkbox", { name: "Pilih Foto catatan.jpg" })
      .check();
    await expect(page.getByText("1 dipilih", { exact: true })).toBeVisible();
    expect(
      warnings.some((message) => message.includes("File thumbnail unavailable"))
    ).toBe(true);
  });

  test("an unreadable PDF shows a preview error without losing its processing status", async ({
    page,
  }) => {
    const file = visualItems()[3]!;
    await page.route("**/file-library/items?**", (route) =>
      route.fulfill({
        json: { data: [file], pagination: { total: 1, offset: 0, limit: 50 } },
      })
    );
    await page.route("**/documents/visual-file-0/content", (route) =>
      route.fulfill({
        contentType: "application/pdf",
        body: "Unreadable PDF fixture",
        headers: {
          "Access-Control-Allow-Origin": new URL(page.url()).origin,
          "Access-Control-Allow-Credentials": "true",
        },
      })
    );
    await page.goto("/files");
    await waitForWorkspace(page);
    await page.getByRole("button", { name: "Tampilan kisi" }).click();

    await expect(
      page.getByText("Pratinjau tidak tersedia", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText("Memuat pratinjau Catatan rapat.pdf", { exact: true })
    ).toHaveCount(0);
    await expect(page.getByText("Siap", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Catatan rapat.pdf", exact: true })
    ).toBeVisible();
  });

  test.describe("mobile", () => {
    test.use({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    test("selects a grid folder and moves it without dragging", async ({
      page,
    }) => {
      await folder(page, "Kerja");
      await folder(page, "Belajar");
      await page.goto("/files");
      await waitForWorkspace(page);
      await expect(
        page.getByRole("button", { name: "Folder baru", exact: true })
      ).toBeEnabled();
      await page.getByRole("button", { name: "Tampilan kisi" }).click();
      await page
        .getByRole("checkbox", { name: "Pilih Belajar", exact: true })
        .check();
      await page.getByRole("button", { name: /^Pindahkan(?: ke…)?$/ }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "Kerja", exact: true }).click();
      await dialog.getByRole("button", { name: "Pindahkan ke sini" }).click();
      await expect(dialog).not.toBeVisible();
      await page.getByRole("link", { name: "Kerja", exact: true }).click();
      await expect(
        page.getByRole("link", { name: "Belajar", exact: true })
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      ).toBe(true);
    });
  });
});
