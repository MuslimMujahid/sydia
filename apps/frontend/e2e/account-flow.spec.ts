import { expect, test } from "@playwright/test";

test("registers, configures, persists, and recovers an account session", async ({
  page,
  context,
}) => {
  const suffix = `${Date.now()}-${test.info().workerIndex}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  const password = "Playwright-e2e-password-123!";
  const initialName = `Phase User ${suffix}`;
  const updatedName = `Updated User ${suffix}`;
  const email = `playwright-${suffix}@example.com`;

  await page.goto("/settings/profile");
  await expect(page).toHaveURL(/\/sign-in\?/);
  const signInRedirect = new URL(page.url()).searchParams.get("redirect");
  expect(signInRedirect).toContain("/settings/profile");
  await expect(page.getByText("Sign in to open that page.")).toBeVisible();

  await page.goto("/sign-up");
  await page.getByLabel("Name").pressSequentially(initialName, { delay: 10 });
  await page.getByLabel("Name").press("Tab");
  await page.getByLabel("Email").pressSequentially(email, { delay: 10 });
  await page.getByLabel("Email").press("Tab");
  await page
    .getByLabel("Password", { exact: true })
    .pressSequentially(password, { delay: 10 });
  await page.getByLabel("Password", { exact: true }).press("Tab");
  await page
    .getByLabel("Confirm password")
    .pressSequentially(password, { delay: 10 });
  await page.getByLabel("Confirm password").press("Tab");
  await expect(page.getByLabel("Confirm password")).toHaveValue(password);
  await expect(
    page.getByRole("button", { name: "Create account" })
  ).toBeEnabled();
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("Timezone").selectOption("Asia/Makassar");
  await page.getByLabel("Language").selectOption("en");
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", {
      name: `Good to have you here, ${initialName.split(" ")[0]}.`,
    })
  ).toBeVisible();
  await expect(
    page.getByText("Your interpretation context is set.")
  ).toBeVisible();

  await page
    .getByRole("navigation", { name: "Product" })
    .getByRole("link", { name: "Profile & preferences" })
    .click();
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await page.getByLabel("Name").fill("");
  await page.getByLabel("Name").pressSequentially(updatedName);
  await page.getByLabel("Timezone").selectOption("Asia/Jayapura");
  await page.getByLabel("Language").selectOption("id");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Profile and preferences saved."
  );

  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in\?reason=signed-out/);
  await page.getByLabel("Email").pressSequentially(email);
  await page
    .getByLabel("Password", { exact: true })
    .pressSequentially(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", {
      name: `Good to have you here, ${updatedName.split(" ")[0]}.`,
    })
  ).toBeVisible();

  await page
    .getByRole("navigation", { name: "Product" })
    .getByRole("link", { name: "Profile & preferences" })
    .click();
  await expect(page.getByLabel("Name")).toHaveValue(updatedName);
  await expect(page.getByLabel("Timezone")).toHaveValue("Asia/Jayapura");
  await expect(page.getByLabel("Language")).toHaveValue("id");

  // Remove the browser's session credential, then use a fresh document
  // navigation so the protected route must verify the real backend session.
  await context.clearCookies();
  await page.goto("/settings/profile");
  await expect(page).toHaveURL(/\/sign-in\?/);
  await expect(
    page.getByText(/Your session expired|Sign in to open that page\./)
  ).toBeVisible();
});
