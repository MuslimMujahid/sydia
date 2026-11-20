import type { UserOccupation } from "@/lib/services/api/users/users.api";

/**
 * Example messages for the task and reminder empty states, copied from the
 * web's personalization examples (apps/frontend/src/lib/personalization).
 * Household is the default: Sydia's main audience.
 */
export type ExampleTopic = "task" | "reminder";

type ExampleGroup = "household" | "school" | "campus" | "work" | "business";

const EXAMPLE_GROUP: Record<UserOccupation, ExampleGroup> = {
  homemaker: "household",
  school_student: "school",
  university_student: "campus",
  office_worker: "work",
  freelancer: "work",
  business_owner: "business",
  other: "household",
};

const EXAMPLES: Record<ExampleGroup, Record<ExampleTopic, string>> = {
  household: {
    reminder: "Ingetin aku bayar listrik tiap tanggal 20",
    task: "Tambahin tugas beli seragam anak minggu ini",
  },
  school: {
    reminder: "Ingetin aku kumpulin PR matematika besok jam 7 pagi",
    task: "Tambahin tugas bikin kliping IPA buat hari Jumat",
  },
  campus: {
    reminder: "Ingetin aku submit tugas statistik Jumat jam 23.00",
    task: "Tambahin tugas revisi bab 2 skripsi minggu ini",
  },
  work: {
    reminder: "Ingetin aku kirim laporan mingguan tiap Jumat jam 4 sore",
    task: "Tambahin tugas siapkan bahan presentasi buat Senin",
  },
  business: {
    reminder: "Ingetin aku belanja stok tepung tiap Senin pagi",
    task: "Tambahin tugas kirim pesanan Bu Sari besok",
  },
};

export function pageExample(
  topic: ExampleTopic,
  occupation: UserOccupation | null | undefined
): string {
  return EXAMPLES[occupation ? EXAMPLE_GROUP[occupation] : "household"][topic];
}
