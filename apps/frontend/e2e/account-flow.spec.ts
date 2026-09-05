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
  await expect(
    page.getByText("Masuk untuk membuka halaman tersebut.")
  ).toBeVisible();

  await page.goto("/sign-up");
  await page.getByLabel("Nama").pressSequentially(initialName, { delay: 10 });
  await page.getByLabel("Nama").press("Tab");
  await page.getByLabel("Email").pressSequentially(email, { delay: 10 });
  await page.getByLabel("Email").press("Tab");
  await page
    .getByLabel("Kata sandi", { exact: true })
    .pressSequentially(password, { delay: 10 });
  await page.getByLabel("Kata sandi", { exact: true }).press("Tab");
  await page
    .getByLabel("Konfirmasi kata sandi")
    .pressSequentially(password, { delay: 10 });
  await page.getByLabel("Konfirmasi kata sandi").press("Tab");
  await expect(page.getByLabel("Konfirmasi kata sandi")).toHaveValue(password);
  await expect(page.getByRole("button", { name: "Buat akun" })).toBeEnabled();
  await page.getByRole("button", { name: "Buat akun" }).click();

  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("Zona waktu").selectOption("Asia/Makassar");
  await page.getByLabel("Bahasa").selectOption("en");
  await page.getByRole("button", { name: "Simpan dan lanjutkan" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", {
      name: `Selamat datang, ${initialName.split(" ")[0]}.`,
    })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Preferensi yang digunakan Sydia" })
  ).toBeVisible();

  await page
    .getByRole("navigation", { name: "Navigasi utama" })
    .getByRole("link", { name: "Profil & preferensi" })
    .click();
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await page.getByLabel("Nama").fill("");
  await page.getByLabel("Nama").pressSequentially(updatedName);
  await page.getByLabel("Zona waktu").selectOption("Asia/Jayapura");
  await page.getByLabel("Bahasa").selectOption("id");
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Profil dan preferensi berhasil disimpan."
  );

  await page.getByRole("button", { name: "Buka menu akun" }).click();
  await page.getByRole("menuitem", { name: "Keluar" }).click();
  await expect(page).toHaveURL(/\/sign-in\?reason=signed-out/);
  await page.getByLabel("Email").pressSequentially(email);
  await page
    .getByLabel("Kata sandi", { exact: true })
    .pressSequentially(password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", {
      name: `Selamat datang, ${updatedName.split(" ")[0]}.`,
    })
  ).toBeVisible();

  await page
    .getByRole("navigation", { name: "Navigasi utama" })
    .getByRole("link", { name: "Profil & preferensi" })
    .click();
  await expect(page.getByLabel("Nama")).toHaveValue(updatedName);
  await expect(page.getByLabel("Zona waktu")).toHaveValue("Asia/Jayapura");
  await expect(page.getByLabel("Bahasa")).toHaveValue("id");

  // Remove the browser's session credential, then use a fresh document
  // navigation so the protected route must verify the real backend session.
  await context.clearCookies();
  await page.goto("/settings/profile");
  await expect(page).toHaveURL(/\/sign-in\?/);
  await expect(
    page.getByText(
      /Sesi Anda telah berakhir|Masuk untuk membuka halaman tersebut\./
    )
  ).toBeVisible();
});
