import { describe, expect, test } from "bun:test";
import type { DeletionOperation } from "@/lib/services/api/file-library/file-library.api";
import {
  cameraFileName,
  deletedSummary,
  deletionCountLabel,
  fileExtension,
  guessMimeType,
  humanizeKey,
  isUnavailableDestination,
  itemStatusLabel,
  libraryPathLabel,
  normalizeUploadName,
  safeFileName,
  sortLabel,
  visibleStructuredData,
} from "./file-format";

function operation(
  files: Partial<DeletionOperation["files"]>,
  folders: Partial<DeletionOperation["folders"]>
): DeletionOperation {
  return {
    id: "op",
    status: "completed",
    selection: [],
    files: { total: 0, completed: 0, failed: 0, pending: 0, ...files },
    folders: {
      total: 0,
      completed: 0,
      failed: 0,
      pending: 0,
      retained: 0,
      ...folders,
    },
  };
}

describe("itemStatusLabel", () => {
  test("a deleting item reads as deleting whatever its processing state", () => {
    expect(itemStatusLabel({ status: "processing", deleting: true })).toBe(
      "Menghapus…"
    );
  });

  test("ready documents with skipped images say how many were skipped", () => {
    expect(
      itemStatusLabel({
        status: "ready",
        deleting: false,
        skippedImageCount: 3,
      })
    ).toBe("3 gambar tidak dianalisis");
  });

  test("folders have no status line", () => {
    expect(itemStatusLabel({ status: null, deleting: false })).toBeNull();
  });
});

describe("fileExtension", () => {
  test("returns the upper-case extension", () => {
    expect(fileExtension("Kartu Keluarga.pdf")).toBe("PDF");
  });

  test("returns null without an extension", () => {
    expect(fileExtension("README")).toBeNull();
  });
});

describe("libraryPathLabel", () => {
  test("starts every path at File saya", () => {
    expect(libraryPathLabel([])).toBe("File saya");
    expect(
      libraryPathLabel([
        { id: "a", name: "Keluarga" },
        { id: "b", name: "KK" },
      ])
    ).toBe("File saya / Keluarga / KK");
  });
});

describe("deletion labels", () => {
  test("counts list files before folders", () => {
    expect(deletionCountLabel(2, 1)).toBe("2 file dan 1 folder");
    expect(deletionCountLabel(0, 0)).toBe("Pilihan ini");
  });

  test("summaries count only completed deletions", () => {
    expect(deletedSummary(operation({ completed: 3 }, { completed: 1 }))).toBe(
      "3 file dan 1 folder dihapus"
    );
    expect(deletedSummary(operation({}, {}))).toBe("Penghapusan selesai");
  });
});

describe("sortLabel", () => {
  test("names the active sort", () => {
    expect(sortLabel({ sort: "createdAt", direction: "desc" })).toBe(
      "Terbaru ditambahkan"
    );
  });
});

describe("isUnavailableDestination", () => {
  const selected = new Set(["folder-a"]);

  test("rejects a selected folder and its descendants", () => {
    expect(isUnavailableDestination(selected, "folder-a", [])).toBe(true);
    expect(
      isUnavailableDestination(selected, "folder-b", [{ id: "folder-a" }])
    ).toBe(true);
  });

  test("allows unrelated folders", () => {
    expect(
      isUnavailableDestination(selected, "folder-c", [{ id: "folder-x" }])
    ).toBe(false);
  });
});

describe("upload names", () => {
  test("fixes the extension of a photo converted to JPEG", () => {
    expect(normalizeUploadName("IMG_0001.HEIC", "image/jpeg")).toBe(
      "IMG_0001.jpg"
    );
  });

  test("adds a missing extension and keeps matching ones", () => {
    expect(normalizeUploadName("scan", "image/png")).toBe("scan.png");
    expect(normalizeUploadName("nota.jpeg", "image/jpeg")).toBe("nota.jpeg");
  });

  test("leaves non-image names alone", () => {
    expect(normalizeUploadName("Rapor.pdf", "application/pdf")).toBe(
      "Rapor.pdf"
    );
  });

  test("guesses common MIME types from the extension", () => {
    expect(guessMimeType("Tagihan.PDF")).toBe("application/pdf");
    expect(guessMimeType("catatan.md")).toBe("text/markdown");
    expect(guessMimeType("archive.xyz")).toBeNull();
  });

  test("names camera captures by their local time", () => {
    expect(cameraFileName(new Date(2026, 10, 19, 22, 15, 30))).toBe(
      "foto-20261119-221530.jpg"
    );
  });

  test("makes download names safe for the file system", () => {
    expect(safeFileName('Nota: "Mei"/2026?.pdf')).toBe("Nota- -Mei--2026-.pdf");
    expect(safeFileName("   ")).toBe("file");
  });
});

describe("structured data", () => {
  test("hides internal keys and empty values and humanizes the rest", () => {
    expect(
      visibleStructuredData({
        skippedImageCount: 2,
        invoiceNumber: "INV-7",
        total_amount: 125000,
        paid: true,
        note: null,
      })
    ).toEqual([
      ["Invoice number", "INV-7"],
      ["Total amount", "125000"],
      ["Paid", "Ya"],
    ]);
  });

  test("humanizes camel and snake case keys", () => {
    expect(humanizeKey("dueDate")).toBe("Due date");
    expect(humanizeKey("account_number")).toBe("Account number");
  });
});

test("a download named like the parent directory receives a regular file name", () => {
  expect(safeFileName("..")).toBe("file");
});
