import type { UserOccupation } from "@/lib/services/api/users/preferences.api";

/** Example sets; several onboarding answers share one. */
export type ExampleGroup =
  "household" | "school" | "campus" | "work" | "business";

const EXAMPLE_GROUP: Record<UserOccupation, ExampleGroup> = {
  homemaker: "household",
  school_student: "school",
  university_student: "campus",
  office_worker: "work",
  freelancer: "work",
  business_owner: "business",
  other: "household",
};

/** Unanswered questions use the household set, Sydia's main audience. */
export function exampleGroup(
  occupation: UserOccupation | null | undefined
): ExampleGroup {
  return occupation ? EXAMPLE_GROUP[occupation] : "household";
}

/** A page whose empty state shows a message the user could send. */
export type ExampleTopic = "reminder" | "task" | "contact" | "file";

/**
 * Messages that would fill each page, per set. The backend keeps the matching
 * Telegram welcome examples in `telegram-welcome.ts`; keep the voices aligned.
 */
const PAGE_EXAMPLES: Record<ExampleGroup, Record<ExampleTopic, string>> = {
  household: {
    reminder: "Ingetin aku bayar listrik tiap tanggal 20",
    task: "Tambahin tugas beli seragam anak minggu ini",
    contact: "Simpan nomor Bu Rina, wali kelas: 0812-3456-7890",
    file: "Simpan foto KK ini di folder Dokumen Keluarga",
  },
  school: {
    reminder: "Ingetin aku kumpulin PR matematika besok jam 7 pagi",
    task: "Tambahin tugas bikin kliping IPA buat hari Jumat",
    contact: "Simpan nomor Pak Budi, wali kelas: 0812-3456-7890",
    file: "Simpan foto jadwal pelajaran ini di folder Sekolah",
  },
  campus: {
    reminder: "Ingetin aku submit tugas statistik Jumat jam 23.00",
    task: "Tambahin tugas revisi bab 2 skripsi minggu ini",
    contact: "Simpan nomor Bu Sinta, dosen pembimbing: 0812-3456-7890",
    file: "Simpan PDF jurnal ini di folder Skripsi",
  },
  work: {
    reminder: "Ingetin aku kirim laporan mingguan tiap Jumat jam 4 sore",
    task: "Tambahin tugas siapkan bahan presentasi buat Senin",
    contact: "Simpan nomor Pak Andi, klien PT Maju: 0812-3456-7890",
    file: "Simpan PDF kontrak ini di folder Kerjaan",
  },
  business: {
    reminder: "Ingetin aku belanja stok tepung tiap Senin pagi",
    task: "Tambahin tugas kirim pesanan Bu Sari besok",
    contact: "Simpan nomor Bu Sari, pelanggan tetap: 0812-3456-7890",
    file: "Simpan foto nota supplier ini di folder Usaha",
  },
};

export function pageExample(
  topic: ExampleTopic,
  occupation: UserOccupation | null | undefined
): string {
  return PAGE_EXAMPLES[exampleGroup(occupation)][topic];
}
