import { expect, test, type Page, type Route } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";

const backend = process.env.PLAYWRIGHT_BACKEND_URL ?? "http://localhost:5000";
test.setTimeout(60_000);

async function createPendingAccount(
  page: Page,
  email = `recovery-presentation-${randomUUID()}@example.test`
) {
  const response = await page.request.post(
    `${backend}/api/auth/sign-up/email`,
    {
      headers: { origin: "http://localhost:3000" },
      data: {
        name: "Recovery presentation",
        email,
        password: "Registration123!",
      },
    }
  );

  expect(response.status()).toBe(200);

  return email;
}

// Only the response under presentation review is controlled. Account creation,
// session cookies, route guards, initial delivery, and retry delivery stay real.
async function failPost(
  page: Page,
  path: string,
  status: number,
  payload: { code: string; message: string; retryAfter?: number }
) {
  const url = `${backend}/api/auth/${path}`;

  const handler = async (route: Route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status,
      headers: {
        "access-control-allow-origin": "http://localhost:3000",
        "access-control-allow-credentials": "true",
      },
      json: payload,
    });
  };

  await page.route(url, handler);

  return () => page.unroute(url, handler);
}

async function captureRecovery(page: Page, name: string, headingY = 136) {
  const directory = process.env.AUTH_VISUAL_DIR;
  await page.setViewportSize({ width: 390, height: 844 });

  // Measured on Penpot's shared recovery boards, independently of app CSS.
  expect(
    await page.getByRole("heading", { level: 1 }).boundingBox()
  ).toMatchObject({
    x: 24,
    y: headingY,
    width: 342,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(390);

  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: `${directory}/${name}-mobile.fixture.png` });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.screenshot({ path: `${directory}/${name}-desktop.fixture.png` });
}

test("a returning pending account matches the legacy verification layout and offers mailbox recovery", async ({
  page,
}) => {
  await createPendingAccount(
    page,
    `legacy-${randomUUID().slice(0, 8)}@example.test`
  );
  const delivered = page.waitForResponse(
    (response) =>
      response.url() ===
        `${backend}/api/auth/email-otp/send-verification-otp` &&
      response.request().method() === "POST",
    { timeout: 45_000 }
  );

  await page.goto("/verify-email?reason=existing");
  expect((await delivered).status()).toBe(200);
  await expect(
    page.getByLabel("Kode verifikasi", { exact: true })
  ).toBeEditable();
  await page.setViewportSize({ width: 390, height: 844 });

  await expect(
    page.getByRole("heading", { name: "Verifikasi email Anda", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Tidak bisa mengakses email ini?",
      exact: true,
    })
  ).toBeVisible();
  expect(
    await page.getByLabel("Kode verifikasi", { exact: true }).boundingBox()
  ).toMatchObject({ x: 24, y: 413, width: 342, height: 60 });
  expect(
    await page
      .getByRole("button", { name: "Verifikasi dan lanjutkan", exact: true })
      .boundingBox()
  ).toMatchObject({ y: 511 });
  await captureRecovery(page, "legacy", 132);
});

test("a rejected current password offers retry and password recovery without changing the account", async ({
  page,
}) => {
  const email = await createPendingAccount(page);
  await page.goto("/change-email");
  await page
    .getByLabel("Kata sandi saat ini", { exact: true })
    .fill("Wrong123!");
  await page
    .getByLabel("Email baru", { exact: true })
    .fill("replacement@example.test");
  await page
    .getByRole("button", { name: "Kirim kode ke email baru", exact: true })
    .click();

  await expect(
    page.getByRole("heading", {
      name: "Konfirmasi akun belum berhasil",
      exact: true,
    })
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Kata sandi tidak cocok."
  );
  await expect(
    page.getByRole("link", { name: "Lupa kata sandi?", exact: true })
  ).toBeVisible();
  await captureRecovery(page, "identity-rejected");
  await page.getByRole("button", { name: "Coba lagi", exact: true }).click();

  await expect(
    page.getByLabel("Kata sandi saat ini", { exact: true })
  ).toBeEditable();
  const session = await page.request.get(`${backend}/api/auth/get-session`);
  expect(await session.json()).toMatchObject({ user: { email } });
});

test("a replacement email collision returns to editing and preserves the original mailbox", async ({
  page,
}) => {
  const email = await createPendingAccount(page);
  const occupiedEmail = await createPendingAccount(page);
  const signedIn = await page.request.post(
    `${backend}/api/auth/sign-in/email`,
    {
      headers: { origin: "http://localhost:3000" },
      data: { email, password: "Registration123!" },
    }
  );

  expect(signedIn.status()).toBe(200);
  await page.goto("/change-email");
  await page
    .getByLabel("Kata sandi saat ini", { exact: true })
    .fill("Registration123!");
  await page.getByLabel("Email baru", { exact: true }).fill(occupiedEmail);
  await page
    .getByRole("button", { name: "Kirim kode ke email baru", exact: true })
    .click();

  await expect(
    page.getByRole("heading", { name: "Email sudah digunakan", exact: true })
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Akun dan data Anda belum berubah."
  );
  await captureRecovery(page, "email-conflict");
  await page
    .getByRole("button", { name: "Ubah alamat email", exact: true })
    .click();

  await expect(page.getByLabel("Email baru", { exact: true })).toBeEditable();
  const session = await page.request.get(`${backend}/api/auth/get-session`);
  expect(await session.json()).toMatchObject({ user: { email } });
});

test("unavailable password recovery directs the user back to an existing sign-in method", async ({
  page,
}) => {
  await failPost(page, "email-otp/request-password-reset", 400, {
    code: "RECOVERY_UNAVAILABLE",
    message: "Gunakan akun Google yang terhubung untuk masuk.",
  });
  await page.goto("/forgot-password");
  await page
    .getByLabel("Email", { exact: true })
    .fill("google-only@example.test");
  await page
    .getByRole("button", { name: "Kirim kode pemulihan", exact: true })
    .click();

  await expect(
    page.getByRole("heading", {
      name: "Belum bisa memulihkan akun",
      exact: true,
    })
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Gunakan metode masuk yang sudah terhubung."
  );
  await captureRecovery(page, "recovery-unavailable");
  await page
    .getByRole("link", { name: "Kembali ke masuk", exact: true })
    .click();

  await expect(page.getByLabel("Email", { exact: true })).toBeEditable();
  await expect(
    page.getByRole("button", { name: "Lanjutkan dengan Google", exact: true })
  ).toBeEnabled();
});

test("an unverified Google identity explains mailbox verification before requesting its code", async ({
  page,
}) => {
  await createPendingAccount(page);
  await page.route(
    `${backend}/api/auth/registration/methods`,
    async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      await route.fulfill({
        status: 200,
        headers: {
          "access-control-allow-origin": "http://localhost:3000",
          "access-control-allow-credentials": "true",
        },
        json: {
          password: false,
          google: true,
          googleEmail: "google-only@example.test",
          confirmed: true,
          confirmationMethod: "google",
        },
      });
    }
  );
  const deliveries: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url() === `${backend}/api/auth/email-otp/send-verification-otp`
    )
      deliveries.push(request.url());
  });
  // Enter through client navigation so this browser-bound provider fixture
  // handles the methods request rather than the server-rendering process.
  await page.goto("/change-email");
  await expect(
    page.getByLabel("Kata sandi saat ini", { exact: true })
  ).toBeEditable();
  await page
    .getByRole("link", { name: "Kembali ke verifikasi", exact: true })
    .click();

  await expect(page.getByRole("alert")).toContainText(
    "Email dari Google belum dapat diverifikasi."
  );
  await expect(page.getByLabel("Kode verifikasi")).toHaveCount(0);
  expect(deliveries).toEqual([]);
  await captureRecovery(page, "google-unverified");
  const delivered = page.waitForResponse(
    (response) =>
      response.url() ===
        `${backend}/api/auth/email-otp/send-verification-otp` &&
      response.request().method() === "POST",
    { timeout: 45_000 }
  );

  await page
    .getByRole("button", { name: "Verifikasi email", exact: true })
    .click();

  expect((await delivered).status()).toBe(200);
  await expect(
    page.getByLabel("Kode verifikasi", { exact: true })
  ).toBeEditable();
  expect(deliveries).toHaveLength(1);
});

const invalidatedChallenges = [
  {
    code: "OTP_EXPIRED",
    status: 400,
    heading: "Kode sudah kedaluwarsa",
    explanation: "Kode sebelumnya tidak bisa digunakan.",
    capture: "expired-code",
  },
  {
    code: "TOO_MANY_ATTEMPTS",
    status: 403,
    heading: "Batas percobaan tercapai",
    explanation: "Kode dinonaktifkan setelah 5 percobaan salah.",
    capture: "attempt-limit",
  },
] as const;

for (const challenge of invalidatedChallenges) {
  test(`${challenge.code} explains why a new code is needed and preserves the resend cooldown`, async ({
    page,
  }) => {
    await createPendingAccount(page);
    const delivered = page.waitForResponse(
      (response) =>
        response.url() ===
          `${backend}/api/auth/email-otp/send-verification-otp` &&
        response.request().method() === "POST",
      { timeout: 45_000 }
    );

    await page.goto("/verify-email?reason=signup");
    expect((await delivered).status()).toBe(200);
    await failPost(page, "email-otp/verify-email", challenge.status, {
      code: challenge.code,
      message: "Minta kode baru untuk melanjutkan.",
    });
    await page.getByLabel("Kode verifikasi", { exact: true }).fill("000000");
    await page
      .getByRole("button", { name: "Verifikasi email", exact: true })
      .click();

    await expect(
      page.getByRole("heading", { name: challenge.heading, exact: true })
    ).toBeVisible();
    await expect(page.getByRole("alert")).toContainText(challenge.explanation);
    await expect(
      page.getByRole("button", { name: /Kirim kode baru dalam/ })
    ).toBeDisabled();
    await expect(page.getByLabel("Kode verifikasi")).toHaveCount(0);
    await captureRecovery(page, challenge.capture);
  });
}

test("failed delivery offers a retry that delivers a real code", async ({
  page,
}) => {
  await createPendingAccount(page);
  const stopFailure = await failPost(
    page,
    "email-otp/send-verification-otp",
    503,
    { code: "AUTH_DELIVERY_FAILED", message: "Kode belum terkirim. Coba lagi." }
  );

  await page.goto("/verify-email?reason=signup");

  await expect(
    page.getByRole("heading", { name: "Kode belum terkirim", exact: true })
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Periksa alamat email Anda, lalu coba lagi."
  );
  await expect(
    page.getByRole("link", { name: "Email salah? Ubah email", exact: true })
  ).toBeVisible();
  await captureRecovery(page, "delivery-failed");
  await stopFailure();
  const delivered = page.waitForResponse(
    (response) =>
      response.url() ===
        `${backend}/api/auth/email-otp/send-verification-otp` &&
      response.request().method() === "POST",
    { timeout: 45_000 }
  );

  await page
    .getByRole("button", { name: "Coba kirim lagi", exact: true })
    .click();

  expect((await delivered).status()).toBe(200);
  await expect(
    page.getByLabel("Kode verifikasi", { exact: true })
  ).toBeEditable({
    timeout: 45_000,
  });
  await expect(
    page.getByRole("button", { name: /Kirim ulang dalam/ })
  ).toBeDisabled();
});

test("send throttling returns to code entry with the server waiting period intact", async ({
  page,
}) => {
  await createPendingAccount(page);
  await failPost(page, "email-otp/send-verification-otp", 429, {
    code: "AUTH_RATE_LIMITED",
    message: "Tunggu sebelum mencoba lagi.",
    retryAfter: 90,
  });
  await page.goto("/verify-email?reason=signup");

  await expect(
    page.getByRole("heading", { name: "Tunggu sebelum mencoba lagi" })
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Coba lagi setelah waktu tunggu berakhir."
  );
  await captureRecovery(page, "send-limit");
  await page
    .getByRole("button", { name: "Kembali ke verifikasi", exact: true })
    .click();

  await expect(
    page.getByLabel("Kode verifikasi", { exact: true })
  ).toBeEditable();
  await expect(
    page.getByRole("button", { name: /Kirim ulang dalam 01:/ })
  ).toBeDisabled();
});
