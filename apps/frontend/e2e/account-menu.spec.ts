import { expect, test, type Page } from "@playwright/test";

function accountButton(page: Page) {
  return page.getByRole("button", { name: "Buka menu akun" });
}

async function open(page: Page, query: string) {
  await page.goto(`/e2e/account-menu.html?${query}`);
  await accountButton(page).click();

  return page.getByRole("menu");
}

test("a trial account sees its remaining days, storage, and a way to subscribe", async ({
  page,
}) => {
  const menu = await open(page, "plan=trial");
  await expect(menu.getByText("mrdevip15@gmail.com")).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: "Langganan", exact: true })
  ).toBeVisible();
  await expect(menu.getByText("1,5 GB / 10 GB")).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: /Penyimpanan/ })
  ).toHaveAttribute("href", "/settings/billing");
  await expect(
    menu.getByRole("menuitem", { name: /Berlangganan sekarang/ })
  ).toHaveAttribute("href", "/checkout");
  await expect(
    menu.getByRole("menuitem", { name: /Pengaturan/ })
  ).toHaveAttribute("href", "/settings/profile");
  // The account button states the plan under the name.
  await page.keyboard.press("Escape");
  await expect(accountButton(page)).toContainText("Trial gratis");
});

test("an active subscription shows its end date without a purchase prompt", async ({
  page,
}) => {
  const menu = await open(page, "plan=paid");
  await expect(menu.getByRole("menuitem", { name: /Perpanjang/ })).toHaveCount(
    0
  );
  await expect(
    menu.getByRole("menuitem", { name: /Berlangganan sekarang/ })
  ).toHaveCount(0);
});

test("a subscription about to end does not offer a second payment", async ({
  page,
}) => {
  const menu = await open(page, "plan=ending");
  await expect(
    menu.getByRole("menuitem", { name: /Perpanjang langganan/ })
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(accountButton(page)).toContainText("Langganan aktif");
});

test("an expired account is told it is read-only and can renew", async ({
  page,
}) => {
  const menu = await open(page, "plan=expired");
  await expect(
    menu.getByRole("menuitem", { name: /Perpanjang langganan/ })
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(accountButton(page)).toContainText("Perlu perpanjangan");
});

test("without a payment option the plan is shown but no purchase is offered", async ({
  page,
}) => {
  const menu = await open(page, "plan=unavailable");
  await expect(
    menu.getByRole("menuitem", { name: "Langganan", exact: true })
  ).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: /Berlangganan sekarang/ })
  ).toHaveCount(0);
});

for (const plan of ["none", "unenforced"]) {
  test(`${plan}: billing stays out of the account menu`, async ({ page }) => {
    const menu = await open(page, `plan=${plan}`);
    await expect(menu.getByRole("menuitem", { name: /Langganan/ })).toHaveCount(
      0
    );
    await expect(
      menu.getByRole("menuitem", { name: /Penyimpanan/ })
    ).toHaveCount(0);
    await expect(
      menu.getByRole("menuitem", { name: /Pengaturan/ })
    ).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Keluar/ })).toBeVisible();
    await page.keyboard.press("Escape");
    // The account button falls back to the email line.
    await expect(accountButton(page)).toContainText("mrdevip15@gmail.com");
  });
}

test("the collapsed sidebar keeps the full plan menu behind the avatar", async ({
  page,
}) => {
  const menu = await open(page, "plan=trial&collapsed=1");
  await expect(
    menu.getByRole("menuitem", { name: "Langganan", exact: true })
  ).toBeVisible();
});
