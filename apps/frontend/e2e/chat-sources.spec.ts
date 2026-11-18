import { expect, test, type Locator, type Page } from "@playwright/test";

const at = "2026-10-25T08:00:00.000Z";
const file = {
  kind: "file",
  id: "budget",
  name: "Budget.pdf",
  parentId: null,
  revision: 1,
  createdAt: at,
  deletingOperationId: null,
  size: 1200,
  mimeType: "application/pdf",
  fileKind: "document",
  status: "ready",
  childCount: null,
  path: [],
};

const folder = {
  ...file,
  kind: "folder",
  id: "work",
  name: "Work",
  size: null,
  status: null,
  childCount: 1,
};

async function setup(page: Page) {
  const state = {
    fail: false,
    sends: [] as Record<string, unknown>[],
    fileError: false,
  };

  await page.route("http://localhost:5000/tasks**", (r) =>
    r.fulfill({ json: { data: [] } })
  );
  await page.route("http://localhost:5000/calendar**", (r) =>
    r.fulfill({ json: { data: [] } })
  );
  await page.route("http://localhost:5000/file-library/**", (r) => {
    if (state.fileError)
      return r.fulfill({
        status: 503,
        json: { error: { code: "SERVICE_UNAVAILABLE", message: "Try again" } },
      });
    const url = new URL(r.request().url());
    const q = url.searchParams.get("q");
    const data = url.searchParams.has("folderId")
      ? []
      : q
        ? [file]
        : [folder, file];

    return r.fulfill({
      json: { data, pagination: { offset: 0, limit: 50, total: data.length } },
    });
  });
  await page.route("http://localhost:5000/notes", (r) =>
    r.fulfill({
      json: {
        data: {
          items: [],
          notes: [
            {
              kind: "note",
              id: "plan",
              ref: "custom:plan",
              title: "Plan",
              path: "Work / Plan",
              parentId: "work",
              excerpt: "",
              updatedAt: at,
            },
            {
              kind: "daily",
              id: "day",
              ref: "daily:2026-10-25",
              title: "2026-10-25",
              path: "",
              parentId: null,
              excerpt: "",
              updatedAt: at,
            },
          ],
        },
      },
    })
  );
  await page.route(
    "http://localhost:5000/conversations/messages/stream",
    async (r) => {
      const input = r.request().postDataJSON() as Record<string, unknown>;
      state.sends.push(input);
      if (state.fail)
        return r.fulfill({
          status: 400,
          json: {
            error: {
              code: "BAD_REQUEST",
              message:
                "File sumber tidak tersedia. Hapus sumber tersebut lalu coba lagi.",
            },
          },
        });
      const result = {
        conversation: {
          id: "chat",
          title: "Compare",
          createdAt: at,
          updatedAt: at,
        },
        userMessage: {
          id: "sent",
          conversationId: "chat",
          role: "user",
          content: input.content,
          sourceSegments: input.sourceSegments,
          createdAt: at,
          attachments: [],
        },
        assistantMessage: {
          id: "answer",
          conversationId: "chat",
          role: "assistant",
          content: "Done",
          createdAt: at,
          attachments: [],
        },
        assistantRun: {
          id: "run",
          conversationId: "chat",
          assistantMessageId: "answer",
          status: "completed",
          errorMessage: null,
          createdAt: at,
          updatedAt: at,
        },
        toolInvocations: [],
      };

      return r.fulfill({
        contentType: "text/event-stream",
        body: `data: ${JSON.stringify({ type: "data-turn", data: result })}\n\ndata: [DONE]\n\n`,
      });
    }
  );
  await page.goto("/e2e/chat-sources.html");
  await expect(
    page.getByRole("textbox", { name: "Pesan untuk Sydia" })
  ).toBeVisible();

  return state;
}

async function files(page: Page, text = "Compare @") {
  await page.getByRole("textbox", { name: "Pesan untuk Sydia" }).fill(text);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
}

async function mockImageUpload(page: Page) {
  await page.route("http://localhost:5000/documents", (route) =>
    route.fulfill({
      json: {
        data: {
          id: "clipboard-image",
          title: "Screenshot.png",
          status: "ready",
          file: { kind: "image" },
        },
      },
    })
  );
}

async function pasteImage(composer: Locator, text?: string) {
  await composer.focus();
  await composer.evaluate((editor, clipboardText) => {
    const png = Uint8Array.fromBase64(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKbsAAAAASUVORK5CYII="
    );

    const clipboardData = new DataTransfer();

    clipboardData.items.add(
      new File([png], "Screenshot.png", { type: "image/png" })
    );

    if (clipboardText !== undefined)
      clipboardData.setData("text/plain", clipboardText);
    editor.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData,
        bubbles: true,
        cancelable: true,
      })
    );
  }, text);
}

test("a pasted screenshot can be sent without typing a message", async ({
  page,
}) => {
  const state = await setup(page);
  await mockImageUpload(page);
  const composer = page.getByRole("textbox", { name: "Pesan untuk Sydia" });

  await pasteImage(composer);

  const attachment = page
    .getByRole("list", { name: "Lampiran pesan" })
    .getByRole("listitem")
    .filter({ hasText: "Screenshot.png" });

  await expect(attachment.getByText("Siap", { exact: true })).toBeVisible();
  await expect(composer).toHaveText("");
  expect(state.sends).toEqual([]);
  await page.getByRole("button", { name: "Kirim pesan", exact: true }).click();
  await expect
    .poll(() => state.sends[0]?.attachmentIds)
    .toEqual(["clipboard-image"]);
});

test("a document with skipped images shows a warning and can still be sent", async ({
  page,
}) => {
  const state = await setup(page);
  const document = {
    id: "partial-document",
    title: "Regulation.docx",
    file: { kind: "document" },
  };

  await page.route("http://localhost:5000/documents", (route) =>
    route.fulfill({ json: { data: { ...document, status: "processing" } } })
  );
  await page.route(
    "http://localhost:5000/documents/partial-document",
    (route) =>
      route.fulfill({
        json: {
          data: {
            ...document,
            status: "ready",
            structuredData: { skippedImageCount: 33 },
          },
        },
      })
  );

  await page.locator('input[type="file"]').setInputFiles({
    name: "Regulation.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from("mocked DOCX upload"),
  });

  await expect(page.getByText("33 gambar tidak dianalisis")).toBeVisible();
  await page.getByRole("button", { name: "Kirim pesan", exact: true }).click();
  await expect
    .poll(() => state.sends[0]?.attachmentIds)
    .toEqual(["partial-document"]);
});

test("pasting an image with text adds the attachment and inserts the text", async ({
  page,
}) => {
  await setup(page);
  await mockImageUpload(page);
  const composer = page.getByRole("textbox", { name: "Pesan untuk Sydia" });

  await pasteImage(composer, "My screenshot");

  await expect(
    page.getByRole("button", { name: "Hapus lampiran Screenshot.png" })
  ).toBeVisible();
  await expect(composer).toHaveText("My screenshot");
});

test("Enter opens a selector without sending and cancel restores the exact draft and focus", async ({
  page,
}) => {
  const state = await setup(page);
  await files(page);
  await page.getByRole("checkbox", { name: "Pilih Work", exact: true }).check();
  await page.getByRole("button", { name: "Batal", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Pesan untuk Sydia" })
  ).toHaveText("Compare @");
  await expect(
    page.getByRole("textbox", { name: "Pesan untuk Sydia" })
  ).toBeFocused();
  expect(state.sends).toEqual([]);
});
test("file and folder selection survive browsing and global search", async ({
  page,
}) => {
  await setup(page);
  await files(page);
  await page.getByRole("checkbox", { name: "Pilih Work", exact: true }).check();
  await page.getByRole("button", { name: "Buka folder Work" }).click();
  await expect(
    page.getByRole("button", { name: "Tambahkan (1)" })
  ).toBeEnabled();
  await page.getByRole("textbox", { name: "Cari sumber" }).fill("Budget");
  await page
    .getByRole("checkbox", { name: "Pilih Budget.pdf", exact: true })
    .check();
  await page.getByRole("button", { name: "Tambahkan (2)" }).click();
  await expect(
    page.getByRole("textbox", { name: "Pesan untuk Sydia" })
  ).toContainText("Compare Work Budget.pdf");
  await expect(
    page.getByRole("textbox", { name: "Pesan untuk Sydia" })
  ).toBeFocused();
});
test("a failed first send keeps the source draft and reuses its retry identity", async ({
  page,
}) => {
  const state = await setup(page);
  state.fail = true;
  await files(page);
  await page
    .getByRole("checkbox", { name: "Pilih Budget.pdf", exact: true })
    .check();
  await page.getByRole("button", { name: "Tambahkan (1)" }).click();
  await page.getByRole("button", { name: "Kirim pesan", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "File sumber tidak tersedia"
  );
  await expect(
    page.getByRole("textbox", { name: "Pesan untuk Sydia" })
  ).toContainText("Budget.pdf");
  await page.getByRole("button", { name: "Kirim pesan", exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(2);
  expect(state.sends[0]?.idempotencyKey).toBe(state.sends[1]?.idempotencyKey);
  expect(state.sends[1]?.sourceSegments).toEqual([
    { type: "text", text: "Compare " },
    {
      type: "source",
      source: { kind: "file", id: "budget", label: "Budget.pdf", path: "" },
    },
    { type: "text", text: " " },
  ]);
});
test("selecting a note inserts its reference without opening an editor", async ({
  page,
}) => {
  await setup(page);
  await page.getByRole("textbox", { name: "Pesan untuk Sydia" }).fill("Read @");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.getByRole("checkbox", { name: "Pilih Plan", exact: true }).check();
  await page.getByRole("button", { name: "Tambahkan (1)" }).click();
  await expect(
    page.getByRole("textbox", { name: "Pesan untuk Sydia" })
  ).toContainText("Plan");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Isi catatan" })).toHaveCount(
    0
  );
});

test("a source load failure retains selected identities and recovers without clearing them", async ({
  page,
}) => {
  const state = await setup(page);
  await files(page);
  await page.getByRole("checkbox", { name: "Pilih Work", exact: true }).check();
  state.fileError = true;
  await page.getByRole("textbox", { name: "Cari sumber" }).fill("Budget");
  await expect(page.getByRole("alert")).toContainText(
    "Pilihanmu tetap tersimpan"
  );
  await expect(
    page.getByRole("button", { name: "Tambahkan (1)" })
  ).toBeEnabled();
  state.fileError = false;
  await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Pilih Budget.pdf", exact: true })
    .check();
  await expect(
    page.getByRole("button", { name: "Tambahkan (2)" })
  ).toBeEnabled();
});
test("confirm inserts at the saved cursor position before the remaining draft", async ({
  page,
}) => {
  await setup(page);
  const composer = page.getByRole("textbox", { name: "Pesan untuk Sydia" });
  await composer.fill("Compare  tomorrow");
  await composer.evaluate((element) => {
    const text = element.querySelector("p")?.firstChild;
    if (!text) throw new Error("Composer text is missing");
    const range = document.createRange();
    range.setStart(text, 8);
    range.collapse(true);
    const selection = window.getSelection();
    if (!selection) throw new Error("Selection is unavailable");
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.type("@");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Enter");
  await page
    .getByRole("checkbox", { name: "Pilih Budget.pdf", exact: true })
    .check();
  await page.getByRole("button", { name: "Tambahkan (1)" }).click();
  await expect(composer).toHaveText("Compare Budget.pdf  tomorrow");
});
test("IME Enter does not send and literal email addresses do not open source actions", async ({
  page,
}) => {
  const state = await setup(page);
  const composer = page.getByRole("textbox", { name: "Pesan untuk Sydia" });
  await composer.fill("mail@example.com");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await composer.dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    isComposing: true,
  });
  expect(state.sends).toEqual([]);
});
test("successful sends clear text and references", async ({ page }) => {
  const state = await setup(page);
  await files(page);
  await page
    .getByRole("checkbox", { name: "Pilih Budget.pdf", exact: true })
    .check();
  await page.getByRole("button", { name: "Tambahkan (1)" }).click();
  await page.getByRole("button", { name: "Kirim pesan", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Pesan untuk Sydia" })
  ).toHaveText("");
  expect(state.sends).toHaveLength(1);
});

async function trackUploadedImage(page: Page) {
  const calls = { polls: 0, deletes: 0 };

  await page.route(
    "http://localhost:5000/documents/clipboard-image",
    (route) => {
      if (route.request().method() === "DELETE") {
        calls.deletes += 1;

        return route.fulfill({ status: 204 });
      }

      calls.polls += 1;

      return route.fulfill({
        json: {
          data: {
            id: "clipboard-image",
            title: "Screenshot.png",
            status: "processing",
            file: { kind: "image" },
          },
        },
      });
    }
  );

  return calls;
}

test("removing an image that is still processing deletes it and stops checking", async ({
  page,
}) => {
  await setup(page);
  const calls = await trackUploadedImage(page);
  await page.route("http://localhost:5000/documents", (route) =>
    route.fulfill({
      json: {
        data: {
          id: "clipboard-image",
          title: "Screenshot.png",
          status: "processing",
          file: { kind: "image" },
        },
      },
    })
  );
  const composer = page.getByRole("textbox", { name: "Pesan untuk Sydia" });

  await pasteImage(composer);
  await expect(page.getByText("Memproses", { exact: true })).toBeVisible();
  await expect.poll(() => calls.polls).toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Hapus lampiran Screenshot.png" })
    .click();

  await expect.poll(() => calls.deletes).toBe(1);
  const pollsAtRemoval = calls.polls;
  // Status checks run every 2 seconds; a stopped check makes no further call.
  await page.waitForTimeout(2_500);
  expect(calls.polls).toBe(pollsAtRemoval);
  await expect(page.getByRole("list", { name: "Lampiran pesan" })).toHaveCount(
    0
  );
});

test("removing an image while it uploads deletes it once the upload lands", async ({
  page,
}) => {
  await setup(page);
  const calls = await trackUploadedImage(page);

  let finishUpload = () => {};

  const uploadHeld = new Promise<void>((resolve) => {
    finishUpload = resolve;
  });

  await page.route("http://localhost:5000/documents", async (route) => {
    await uploadHeld;

    return route.fulfill({
      json: {
        data: {
          id: "clipboard-image",
          title: "Screenshot.png",
          status: "processing",
          file: { kind: "image" },
        },
      },
    });
  });
  const composer = page.getByRole("textbox", { name: "Pesan untuk Sydia" });

  await pasteImage(composer);
  await expect(page.getByText("Mengunggah", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Hapus lampiran Screenshot.png" })
    .click();
  finishUpload();

  await expect.poll(() => calls.deletes).toBe(1);
  expect(calls.polls).toBe(0);
});
