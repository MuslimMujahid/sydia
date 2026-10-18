import { expect, test } from "@playwright/test";

test("folder branches collapse without changing the destination", async ({
  page,
}) => {
  await page.goto("/e2e/notes-move.html");
  await page
    .getByRole("button", { name: "Tutup folder Kerja", exact: true })
    .click();
  await expect(
    page.getByRole("radio", { name: "Kerja / Proyek", exact: true })
  ).toBeHidden();
  await page
    .getByRole("button", { name: "Buka folder Kerja", exact: true })
    .click();
  await expect(
    page.getByRole("radio", { name: "Kerja / Proyek / Sydia", exact: true })
  ).toBeChecked();
});

test("search finds nested destinations inside a collapsed branch", async ({
  page,
}) => {
  await page.goto("/e2e/notes-move.html");
  await page
    .getByRole("button", { name: "Tutup folder Kerja", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Cari folder tujuan" })
    .fill("Referensi");
  await expect(
    page.getByRole("radio", { name: "Kerja / Referensi", exact: true })
  ).toBeAttached();
  await page.getByText("Kerja / Referensi", { exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "Kerja / Referensi", exact: true })
  ).toBeChecked();
});

test("moving submits the selected folder and closes the dialog", async ({
  page,
}) => {
  await page.route("**/notes/items/note", (route) =>
    route.fulfill({ json: { data: {} } })
  );
  await page.goto("/e2e/notes-move.html");
  await page.getByText("Referensi", { exact: true }).click();
  const request = page.waitForRequest(
    (request) =>
      request.method() === "PATCH" &&
      request.url().endsWith("/notes/items/note")
  );

  await page.getByRole("button", { name: "Pindahkan", exact: true }).click();
  expect((await request).postDataJSON()).toEqual({
    revision: 1,
    parentId: "reference",
  });
  await expect(page.getByText("Dialog ditutup")).toBeVisible();
});

test("folders cannot move into themselves, descendants, or trash", async ({
  page,
}) => {
  await page.goto("/e2e/notes-move.html?folder");
  await expect(page.getByRole("radio")).toHaveCount(2);
  await expect(
    page.getByRole("radio", { name: "Semua catatan", exact: true })
  ).toBeChecked();
  await expect(
    page.getByRole("radio", { name: "Pribadi", exact: true })
  ).toBeAttached();
});

test("an unmatched search explains the empty result and keeps root selectable", async ({
  page,
}) => {
  await page.goto("/e2e/notes-move.html");
  await page
    .getByRole("textbox", { name: "Cari folder tujuan" })
    .fill("Tidak ada");
  await expect(page.getByRole("status")).toHaveText("Folder tidak ditemukan.");
  await page.getByText("Semua catatan", { exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "Semua catatan", exact: true })
  ).toBeChecked();
});
