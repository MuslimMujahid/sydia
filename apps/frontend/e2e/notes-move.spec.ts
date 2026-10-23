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
  await page
    .getByRole("radio", { name: "Kerja / Referensi", exact: true })
    .check();
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
  await page
    .getByRole("radio", { name: "Kerja / Referensi", exact: true })
    .check();
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
  await page.getByRole("radio", { name: "Semua catatan", exact: true }).check();
  await expect(
    page.getByRole("radio", { name: "Semua catatan", exact: true })
  ).toBeChecked();
});

test("Tambah folder creates a child inside a collapsed folder", async ({
  page,
}) => {
  await page.route("**/notes/items", (route) =>
    route.fulfill({ json: { data: {} } })
  );
  await page.goto("/e2e/notes-move.html#tree");
  const folder = page.getByRole("button", { name: "Kerja", exact: true });
  await folder.click();
  await page
    .getByRole("button", { name: "Tindakan Kerja", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Tambah folder", exact: true })
    .click();
  const name = page.getByRole("textbox", { name: "Nama folder", exact: true });
  await expect(folder).toHaveAttribute("aria-expanded", "true");
  await expect(name).toBeFocused();
  await expect(name).toHaveAccessibleDescription(/Di Kerja\./);
  await name.fill("Riset");
  const request = page.waitForRequest(
    (request) =>
      request.method() === "POST" && request.url().endsWith("/notes/items")
  );

  await name.press("Enter");
  expect((await request).postDataJSON()).toEqual({
    kind: "folder",
    parentId: "work",
    title: "Riset",
    requestKey: expect.any(String),
  });
  await expect(name).toBeHidden();
});

test("cancelling a child folder returns focus to its folder menu", async ({
  page,
}) => {
  await page.goto("/e2e/notes-move.html#tree");
  const trigger = page.getByRole("button", {
    name: "Tindakan Proyek",
    exact: true,
  });

  await trigger.click();
  await page
    .getByRole("menuitem", { name: "Tambah folder", exact: true })
    .click();
  const name = page.getByRole("textbox", { name: "Nama folder", exact: true });
  await expect(name).toBeFocused();
  await name.press("Escape");
  await expect(name).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("duplicate folder names open an error popup and retain the draft for correction", async ({
  page,
}) => {
  await page.route("**/notes/items", (route) =>
    route.fulfill({
      status: 409,
      json: {
        error: {
          message: "Nama sudah digunakan di folder tujuan. Pilih nama lain.",
          code: "CONFLICT",
          details: { reason: "NAME_COLLISION" },
        },
      },
    })
  );
  await page.goto("/e2e/notes-move.html#tree");
  await page
    .getByRole("button", { name: "Tindakan Kerja", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Tambah folder", exact: true })
    .click();
  const name = page.getByRole("textbox", { name: "Nama folder", exact: true });
  await name.fill("Proyek");
  await name.press("Enter");
  const popup = page.getByRole("alert");
  await expect(popup).toBeVisible();
  await expect(popup).toHaveText(
    "Nama sudah digunakan di folder tujuan. Pilih nama lain."
  );
  await expect(
    page
      .getByRole("form", { name: "Folder baru", includeHidden: true })
      .getByRole("alert", { includeHidden: true })
  ).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(popup).toBeInViewport({ ratio: 1 });
  const inputBounds = await name.boundingBox();
  const popupBounds = await popup.boundingBox();
  expect(popupBounds!.y).toBeGreaterThanOrEqual(
    inputBounds!.y + inputBounds!.height
  );
  await expect(name).toBeFocused();
  await expect(name).toHaveValue("Proyek");
  await name.fill("Proyek baru");
  await expect(popup).toBeHidden();
  await expect(name).toHaveAttribute("aria-invalid", "false");
  await page.route("**/notes/items", (route) =>
    route.fulfill({ json: { data: {} } })
  );
  await name.press("Enter");
  await expect(name).toBeHidden();
});

test("folder error bubbles hide when their field scrolls out of view", async ({
  page,
}) => {
  await page.route("**/notes/items", (route) =>
    route.fulfill({
      status: 409,
      json: {
        error: {
          message: "Nama sudah digunakan di folder tujuan. Pilih nama lain.",
          code: "CONFLICT",
        },
      },
    })
  );
  await page.goto("/e2e/notes-move.html?deep-tree#tree");
  await page
    .getByRole("button", { name: "Tindakan Folder 8", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Tambah folder", exact: true })
    .click();
  const name = page.getByRole("textbox", { name: "Nama folder", exact: true });
  await name.press("Enter");
  const bubble = page.getByRole("alert", { includeHidden: true });
  await expect(bubble).toBeVisible();
  const scroller = page
    .getByRole("region", { name: "Daftar folder" })
    .locator("..");

  await scroller.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(name).not.toBeInViewport();
  await expect(bubble).toBeHidden();
  await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(name).toBeInViewport();
  await expect(bubble).toBeVisible();
  await expect(name).toHaveValue("Folder baru");
});

test("note menus do not offer Tambah folder", async ({ page }) => {
  await page.goto("/e2e/notes-move.html#tree");
  await page
    .getByRole("button", { name: "Tindakan Rencana peluncuran", exact: true })
    .click();
  await expect(page.getByRole("menuitem", { name: "Ubah nama" })).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Tambah folder", exact: true })
  ).toHaveCount(0);
});

for (const width of [1440, 390]) {
  test(`deep trees scroll in the sidebar while actions stay reachable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/e2e/notes-move.html?long-title&deep-tree#tree");
    const sidebar = page.getByRole("region", { name: "Daftar folder" });
    await expect(sidebar).toHaveCSS("mask-image", "none");
    const dailyHeading = page.getByRole("heading", {
      name: "Catatan harian",
      exact: true,
    });

    const folderHeading = page.getByRole("heading", {
      name: "Folder",
      exact: true,
    });

    const dailyBounds = await dailyHeading.boundingBox();
    const dailySection = page.getByRole("region", {
      name: "Catatan harian",
      exact: true,
    });

    const dailySectionBounds = await dailySection.boundingBox();
    const folderBounds = await folderHeading.boundingBox();
    const title =
      "Rencana peluncuran dengan judul yang sangat panjang untuk catatan proyek Sydia";

    const menu = page.getByRole("button", {
      name: `Tindakan ${title}`,
      exact: true,
    });

    const label = page.getByText(title, { exact: true });

    await menu.scrollIntoViewIfNeeded();
    expect(
      await sidebar.locator("..").evaluate((element) => element.scrollTop)
    ).toBeGreaterThan(0);
    expect(await dailySection.boundingBox()).toEqual(dailySectionBounds);
    await expect(dailySection).toBeInViewport({ ratio: 1 });
    await sidebar.hover();
    const labelBounds = await label.boundingBox();
    const menuBounds = await menu.boundingBox();
    expect(labelBounds).not.toBeNull();
    expect(menuBounds).not.toBeNull();
    const sidebarBounds = await sidebar.boundingBox();
    expect(sidebarBounds).not.toBeNull();
    const actionGutterBounds = await menu
      .locator("..")
      .locator("..")
      .boundingBox();

    expect(actionGutterBounds!.x + actionGutterBounds!.width).toBe(
      sidebarBounds!.x + sidebarBounds!.width
    );
    await expect(sidebar).toHaveCSS("scrollbar-width", "none");
    expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(
      sidebarBounds!.x + sidebarBounds!.width
    );
    expect(
      await sidebar.evaluate(
        (element) => element.scrollWidth > element.clientWidth
      )
    ).toBe(true);
    await expect(menu).toBeInViewport({ ratio: 1 });
    await menu.click();
    await expect(
      page.getByRole("menuitem", { name: "Ubah nama" })
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await sidebar.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    expect(
      await sidebar.evaluate((element) => element.scrollLeft)
    ).toBeGreaterThan(0);
    expect(await dailyHeading.boundingBox()).toEqual(dailyBounds);
    await expect(sidebar).toHaveCSS("mask-image", /linear-gradient/);
    expect(await folderHeading.boundingBox()).toEqual(folderBounds);
    await expect(dailyHeading).toBeInViewport({ ratio: 1 });
    await expect(folderHeading).toBeInViewport({ ratio: 1 });
    const scrolledLabelBounds = await label.boundingBox();
    expect(scrolledLabelBounds!.x).toBeLessThan(labelBounds!.x);
    expect(await label.evaluate((element) => element.scrollLeft)).toBe(0);
    await expect(menu).toBeInViewport({ ratio: 1 });
    await menu.click();
    await expect(
      page.getByRole("menuitem", { name: "Ubah nama" })
    ).toBeVisible();
  });

  test(`folder labels toggle children without selecting a folder at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/e2e/notes-move.html#tree");
    const folder = page.getByRole("button", { name: "Kerja", exact: true });
    const child = page.getByRole("button", { name: "Proyek", exact: true });
    await expect(child).toBeVisible();
    await folder.click();
    await expect(child).toBeHidden();
    await expect(folder).toHaveAttribute("aria-expanded", "false");
    await expect(folder).not.toHaveAttribute("aria-current");
    await expect(page.getByRole("status")).toHaveText("custom:note");
    await folder.press("Enter");
    await expect(child).toBeVisible();
    await expect(folder).toHaveAttribute("aria-expanded", "true");
    await expect(
      page.getByRole("button", { name: "Rencana peluncuran", exact: true })
    ).toHaveAttribute("aria-current", "page");
    await folder.press("Space");
    await expect(child).toBeHidden();
    await expect(page.getByRole("status")).toHaveText("custom:note");
  });
}
