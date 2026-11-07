import { getAdminUsers } from "@/lib/services/api/admin/admin.api";
import type { AdminUser, AdminUsersInput } from "./types";

// Quoting alone does not prevent spreadsheets from executing formula cells.
function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  const safe = /^[\s]*[=+@-]/u.test(text) ? `'${text}` : text;

  return `"${safe.replaceAll('"', '""')}"`;
}

export async function exportAdminUsers(input: AdminUsersInput): Promise<void> {
  const users: AdminUser[] = [];
  let offset = 0;
  let total: number;

  do {
    const page = await getAdminUsers({ ...input, offset, limit: 100 });
    total = page.pagination.total;
    if (total > 50_000)
      throw new Error(
        "Ekspor dibatasi 50.000 pengguna. Persempit filter lalu coba lagi."
      );
    if (
      page.pagination.offset !== offset ||
      (!page.data.length && offset < total)
    )
      throw new Error("Daftar pengguna berubah saat ekspor. Coba lagi.");
    users.push(...page.data);
    offset += page.data.length;
  } while (offset < total);

  const rows = [
    [
      "Nama",
      "Email",
      "Akses",
      "Paket",
      "Daftar",
      "Aktivitas terakhir",
      "Plus hingga",
      "Pembayaran (IDR)",
    ],
    ...users.map((user) => [
      user.name,
      user.email,
      user.status === "active" ? "Diizinkan" : "Diblokir",
      user.plan,
      user.createdAt,
      user.lastActivityAt,
      user.paidUntil,
      user.paymentTotalIdr,
    ]),
  ];

  const blob = new Blob(
    ["\uFEFF", rows.map((row) => row.map(csvCell).join(",")).join("\r\n")],
    { type: "text/csv;charset=utf-8" }
  );

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "sydia-pengguna.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
