export type BillingLanguage = "id" | "en";

export function billingLanguage(locale: string): BillingLanguage {
  return locale === "en" ? "en" : "id";
}

export const BILLING_COPY = {
  id: {
    title: "Langganan",
    state: {
      disabled: "Pembayaran belum dibuka",
      trial: "Trial aktif",
      paid: "Langganan aktif",
      expired: "Masa aktif habis",
    },
    normal: "Harga normal",
    term: "per 30 hari",
    until: "Aktif hingga",
    expiredOn: "Berakhir pada",
    features: "Semua fitur · penyimpanan 10 GB · maksimal 100 MB per file",
    renewal:
      "Perpanjangan manual. Harga promo berlaku untuk pembelian dan perpanjangan sampai promo diubah.",
    phone: "Nomor telepon untuk tagihan",
    phoneHelp: "Gunakan nomor dengan kode negara, misalnya +6281234567890.",
    subscribe: "Berlangganan",
    renew: "Perpanjang langganan",
    paidNotice: "Pembayaran diterima. Langganan Anda aktif.",
    renewHint:
      "Perpanjangan ditambahkan setelah masa aktif saat ini berakhir, jadi tidak ada hari yang hilang.",
    create: "Buat tagihan",
    creating: "Menyiapkan tagihan…",
    pay: "Bayar melalui Mayar",
    check: "Periksa pembayaran",
    history: "Riwayat pembayaran",
    empty: "Belum ada pembayaran.",
    storage: "Penyimpanan",
    used: "terpakai dari 10 GB",
    statusTitle: "Status langganan",
    statusDescription: {
      disabled:
        "Pembayaran belum dibuka. Seluruh fitur Sydia dapat Anda gunakan tanpa batas waktu.",
      trial:
        "Anda sedang menjalani trial gratis dengan semua fitur. Berlangganan kapan saja agar akses tetap aktif setelah trial berakhir.",
      paid: "Langganan Anda aktif. Perpanjang secara manual sebelum masa aktif berakhir agar asisten tetap dapat digunakan.",
      expired:
        "Masa aktif Anda telah habis. Data tetap bisa dibaca, diunduh, dan dihapus; perpanjang untuk kembali memakai asisten dan mengubah data.",
    },
    planTitle: "Paket dan pembayaran",
    planDescription:
      "Satu paket mencakup semua fitur Sydia. Pembayaran dilakukan di muka dan diperpanjang secara manual; harga promo berlaku untuk pembelian dan perpanjangan sampai promo diubah.",
    storageDescription:
      "Ruang untuk file asli yang Anda unggah dari semua kanal. Setiap file berukuran maksimal 100 MB.",
    historyDescription: "Tagihan dan pembayaran terbaru Anda.",
    review:
      "Tagihan ini sedang diperiksa. Hubungi dukungan Sydia dan jangan membuat pembayaran ulang.",
    unavailable: "Pembayaran belum tersedia. Hubungi dukungan Sydia.",
    retry: "Coba lagi",
    loading: "Memuat langganan…",
    sandbox: "Mode uji — pembayaran sandbox",
    order: {
      creating: "Menyiapkan tagihan",
      pending: "Menunggu pembayaran",
      paid: "Lunas",
      review: "Sedang diperiksa",
      failed: "Tagihan gagal dibuat",
      expired: "Tagihan kedaluwarsa",
    },
  },
  en: {
    title: "Subscription",
    state: {
      disabled: "Payments are not open yet",
      trial: "Trial active",
      paid: "Subscription active",
      expired: "Access expired",
    },
    normal: "Regular price",
    term: "per 30 days",
    until: "Active until",
    expiredOn: "Expired on",
    features: "All features · 10 GB storage · up to 100 MB per file",
    renewal:
      "Manual renewal. Promotional pricing applies to purchases and renewals until the promotion changes.",
    phone: "Billing phone number",
    phoneHelp: "Include your country code, for example +6281234567890.",
    subscribe: "Subscribe",
    renew: "Renew subscription",
    paidNotice: "Payment received. Your subscription is active.",
    renewHint:
      "A renewal is added after the current period ends, so no days are lost.",
    create: "Create invoice",
    creating: "Preparing invoice…",
    pay: "Pay with Mayar",
    check: "Check payment",
    history: "Payment history",
    empty: "No payments yet.",
    storage: "Storage",
    used: "used of 10 GB",
    statusTitle: "Subscription status",
    statusDescription: {
      disabled:
        "Payments are not open yet. You can use every Sydia feature without a time limit.",
      trial:
        "You are on a free trial with every feature. Subscribe any time to keep access after the trial ends.",
      paid: "Your subscription is active. Renew manually before it ends to keep using the assistant.",
      expired:
        "Your access has expired. You can still read, download, and delete your data; renew to use the assistant and change data again.",
    },
    planTitle: "Plan and payment",
    planDescription:
      "One plan includes every Sydia feature. Payment is prepaid and renewed manually; the promotional price applies to purchases and renewals until the promotion changes.",
    storageDescription:
      "Space for the original files you upload from every channel. Each file can be up to 100 MB.",
    historyDescription: "Your recent invoices and payments.",
    review:
      "This invoice needs review. Contact Sydia support and do not make another payment.",
    unavailable: "Payments are not available yet. Contact Sydia support.",
    retry: "Try again",
    loading: "Loading subscription…",
    sandbox: "Test mode — sandbox payments",
    order: {
      creating: "Preparing invoice",
      pending: "Awaiting payment",
      paid: "Paid",
      review: "Under review",
      failed: "Invoice creation failed",
      expired: "Invoice expired",
    },
  },
};

export function formatBillingCurrency(
  value: number,
  language: BillingLanguage
): string {
  return new Intl.NumberFormat(language === "id" ? "id-ID" : "en-US", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatBillingDate(
  value: string,
  language: BillingLanguage,
  timezone: string
): string {
  return new Intl.DateTimeFormat(language === "id" ? "id-ID" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

const DAY_MS = 86_400_000;

export function formatBillingRemaining(
  until: string,
  now: number,
  language: BillingLanguage
): string {
  const left = Date.parse(until) - now;

  if (left < DAY_MS)
    return language === "id"
      ? "kurang dari 1 hari lagi"
      : "less than 1 day left";
  const days = Math.ceil(left / DAY_MS);

  return language === "id" ? `${days} hari lagi` : `${days} days left`;
}

export type BillingBenefit = {
  icon: "chat" | "reminder" | "memory" | "document" | "calendar" | "storage";
  title: string;
  description: string;
};

type BillingPitch = {
  hero: Record<
    "disabled" | "trial" | "paid" | "expired",
    { eyebrow: string; title: string; body: (details: string) => string }
  >;
  includedTitle: string;
  includedDescription: string;
  benefits: readonly BillingBenefit[];
  save: (percent: number) => string;
  promo: (regular: string) => string;
  prepaid: string;
  endsOn: string;
  expiredOn: string;
};

/** Marketing copy for the subscription page; facts match PRODUCT.md. */
export const BILLING_PITCH: Record<BillingLanguage, BillingPitch> = {
  id: {
    hero: {
      disabled: {
        eyebrow: "Akses terbuka",
        title: "Semua fitur terbuka untuk Anda",
        body: () =>
          "Pembayaran belum dibuka, jadi Anda bisa memakai Sydia tanpa batas waktu.",
      },
      trial: {
        eyebrow: "Trial gratis",
        title: "Sydia sudah bekerja untuk Anda",
        body: () =>
          "Lanjutkan tanpa jeda agar catatan, pengingat, dan tugas Anda tetap terkelola.",
      },
      paid: {
        eyebrow: "Langganan aktif",
        title: "Terima kasih, Sydia siap membantu",
        body: (until) =>
          `Aktif hingga ${until}. Perpanjang kapan saja; hari yang tersisa tetap dihitung.`,
      },
      expired: {
        eyebrow: "Masa aktif habis",
        title: "Sydia sedang berhenti sejenak",
        body: () =>
          "Data Anda aman dan tetap bisa dibaca, diunduh, dan dihapus. Perpanjang untuk kembali dibantu asisten.",
      },
    },
    includedTitle: "Satu harga, semua fitur",
    includedDescription:
      "Tanpa paket bertingkat dan tanpa batas pesan. Anda membayar satu kali untuk 30 hari.",
    benefits: [
      {
        icon: "chat",
        title: "Catat dengan ngobrol",
        description:
          "Tulis atau kirim pesan suara lewat WhatsApp, Telegram, atau web. Sydia mengubahnya menjadi tugas, pengingat, dan catatan.",
      },
      {
        icon: "reminder",
        title: "Pengingat yang menindaklanjuti",
        description:
          "Sydia mengingatkan tepat waktu dan bertanya lagi bila tugas belum selesai.",
      },
      {
        icon: "memory",
        title: "Memori yang Anda kendalikan",
        description:
          "Hal penting tersimpan rapi, dan bisa Anda koreksi atau hapus kapan saja.",
      },
      {
        icon: "document",
        title: "Paham dokumen dan gambar",
        description:
          "Kirim invoice, tangkapan layar, atau PDF. Sydia membacanya untuk Anda.",
      },
      {
        icon: "calendar",
        title: "Kalender dan briefing harian",
        description:
          "Terhubung ke Google Calendar, dengan ringkasan harian pada jam pilihan Anda.",
      },
      {
        icon: "storage",
        title: "Ruang 10 GB",
        description:
          "Simpan file asli hingga 100 MB per file, dari semua kanal.",
      },
    ],
    save: (percent) => `Hemat ${percent}%`,
    promo: (regular) => `Harga promo, normalnya ${regular}`,
    prepaid: "Bayar di muka tanpa tagihan otomatis. Perpanjang saat Anda siap.",
    endsOn: "Berakhir pada",
    expiredOn: "Berakhir pada",
  },
  en: {
    hero: {
      disabled: {
        eyebrow: "Open access",
        title: "Every feature is open to you",
        body: () =>
          "Payments are not open yet, so you can use Sydia without a time limit.",
      },
      trial: {
        eyebrow: "Free trial",
        title: "Sydia is already working for you",
        body: () =>
          "Continue without a gap to keep your notes, reminders, and tasks organized.",
      },
      paid: {
        eyebrow: "Subscription active",
        title: "Thank you, Sydia is ready to help",
        body: (until) =>
          `Active until ${until}. Renew any time; the days you have left still count.`,
      },
      expired: {
        eyebrow: "Access expired",
        title: "Sydia is taking a pause",
        body: () =>
          "Your data is safe and you can still read, download, and delete it. Renew to get the assistant back.",
      },
    },
    includedTitle: "One price, every feature",
    includedDescription:
      "No tiers and no message limits. You pay once for 30 days.",
    benefits: [
      {
        icon: "chat",
        title: "Capture by chatting",
        description:
          "Write or send a voice note on WhatsApp, Telegram, or the web. Sydia turns it into tasks, reminders, and notes.",
      },
      {
        icon: "reminder",
        title: "Reminders that follow up",
        description:
          "Sydia reminds you on time and asks again when a task is not done.",
      },
      {
        icon: "memory",
        title: "Memory you control",
        description:
          "Important things are kept tidy, and you can correct or delete them any time.",
      },
      {
        icon: "document",
        title: "Understands documents and images",
        description:
          "Send an invoice, a screenshot, or a PDF. Sydia reads it for you.",
      },
      {
        icon: "calendar",
        title: "Calendar and daily briefing",
        description:
          "Connected to Google Calendar, with a daily summary at the time you choose.",
      },
      {
        icon: "storage",
        title: "10 GB of space",
        description:
          "Keep original files up to 100 MB each, from every channel.",
      },
    ],
    save: (percent) => `Save ${percent}%`,
    promo: (regular) => `Promotional price, normally ${regular}`,
    prepaid: "Prepaid with no automatic billing. Renew when you are ready.",
    endsOn: "Ends on",
    expiredOn: "Ended on",
  },
};
