import { expect, test, type Page } from "@playwright/test";

test("an empty page example opens chat with the message ready to send", async ({
  page,
}) => {
  // The chat home reads today's tasks and agenda and the notes index.
  await page.route("http://localhost:5000/tasks**", (route) =>
    route.fulfill({ json: { data: [] } })
  );
  await page.route("http://localhost:5000/calendar**", (route) =>
    route.fulfill({ json: { data: [] } })
  );
  await page.route("http://localhost:5000/notes", (route) =>
    route.fulfill({ json: { data: { items: [], notes: [] } } })
  );
  await page.goto("/e2e/try-in-chat.html");
  await page
    .getByRole("link", {
      name: "Buka di chat: Ingetin aku bayar listrik tiap tanggal 20",
    })
    .click();

  await expect(
    page.getByRole("textbox", { name: "Pesan untuk Sydia" })
  ).toHaveText("Ingetin aku bayar listrik tiap tanggal 20");
  await expect(
    page.getByRole("button", { name: "Kirim pesan", exact: true })
  ).toBeEnabled();
});

async function mockPreferences(page: Page, occupation: string | null) {
  await page.route("http://localhost:5000/users/me/preferences", (route) =>
    route.fulfill({ json: { data: { occupation } } })
  );
}

test("a business owner sees a business example on an empty page", async ({
  page,
}) => {
  await mockPreferences(page, "business_owner");
  await page.goto("/e2e/try-in-chat.html");

  await expect(
    page.getByRole("link", {
      name: "Buka di chat: Ingetin aku belanja stok tepung tiap Senin pagi",
    })
  ).toBeVisible();
});

test("an unanswered self-description shows household examples", async ({
  page,
}) => {
  await mockPreferences(page, null);
  await page.goto("/e2e/try-in-chat.html");

  await expect(
    page.getByRole("link", {
      name: "Buka di chat: Tambahin tugas beli seragam anak minggu ini",
    })
  ).toBeVisible();
});
