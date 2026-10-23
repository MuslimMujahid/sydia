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
      "Semua fitur Sydia siap Anda pakai. Perpanjangan tersedia setelah masa aktif berakhir.",
    create: "Buat tagihan",
    creating: "Menyiapkan tagihan…",
    pay: "Bayar melalui Mayar",
    check: "Periksa pembayaran",
    history: "Riwayat pembayaran",
    empty: "Belum ada pembayaran.",
    storage: "Penyimpanan",
    used: "dari 10 GB terpakai",
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
      "Ruang penyimpanan untuk semua berkas yang Anda unggah. Batas ukuran tiap berkas maksimal 100 MB.",
    historyDescription: "Ketuk pembayaran untuk melihat struk dan invoice.",
    plan: "Sydia Plus",
    review:
      "Tagihan ini sedang diperiksa. Hubungi dukungan Sydia dan jangan membuat pembayaran ulang.",
    unavailable: "Pembayaran belum tersedia. Hubungi dukungan Sydia.",
    retry: "Coba lagi",
    loading: "Memuat langganan…",
    sandbox: "Mode uji — pembayaran sandbox",
    settings: {
      trialTitle: (left: string) => `Trial aktif, sisa ${left}`,
      trialBody:
        "Berlangganan sebelum trial berakhir agar Sydia tetap bisa digunakan.",
      paidTitle: "Sydia Plus aktif",
      paidBody: "Semua fitur Sydia terbuka untuk Anda.",
      remaining: (left: string) => `Sisa ${left}`,
      expiredTitle: "Masa aktif Anda sudah berakhir",
      expiredBody:
        "Data Anda aman dan tetap bisa dibaca, diunduh, atau dihapus. Berlangganan lagi untuk kembali menggunakan Sydia.",
      resubscribe: "Berlangganan lagi",
      discount: (percent: number) => `Diskon ${percent}%`,
      perTerm: "per 30 hari",
      benefits: "Yang Anda dapatkan",
      manageStorage: "Kelola penyimpanan",
      fileLimit: "Maksimal 100 MB per file",
      emptyHistory:
        "Belum ada pembayaran. Struk dan invoice Anda akan muncul di sini.",
    },
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
      "Every Sydia feature is ready for you. Renewal opens once your current period ends.",
    create: "Create invoice",
    creating: "Preparing invoice…",
    pay: "Pay with Mayar",
    check: "Check payment",
    history: "Payment history",
    empty: "No payments yet.",
    storage: "Storage",
    used: "of 10 GB used",
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
      "Space for every file you upload. Each file can be up to 100 MB.",
    historyDescription: "Open a payment to see its receipt and invoice.",
    plan: "Sydia Plus",
    review:
      "This invoice needs review. Contact Sydia support and do not make another payment.",
    unavailable: "Payments are not available yet. Contact Sydia support.",
    retry: "Try again",
    loading: "Loading subscription…",
    sandbox: "Test mode — sandbox payments",
    settings: {
      trialTitle: (left: string) => `Trial active, ${left} left`,
      trialBody:
        "Subscribe before your trial ends so Sydia stays available to you.",
      paidTitle: "Sydia Plus is active",
      paidBody: "Every Sydia feature is open to you.",
      remaining: (left: string) => `${left} left`,
      expiredTitle: "Your access has ended",
      expiredBody:
        "Your data is safe and you can still read, download, or delete it. Subscribe again to keep using Sydia.",
      resubscribe: "Subscribe again",
      discount: (percent: number) => `${percent}% off`,
      perTerm: "per 30 days",
      benefits: "What you get",
      manageStorage: "Manage storage",
      fileLimit: "Up to 100 MB per file",
      emptyHistory:
        "No payments yet. Your receipts and invoices will show up here.",
    },
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

const DAY_LABEL: Record<BillingLanguage, (days: number) => string> = {
  id: (days) => (days < 1 ? "kurang dari 1 hari" : `${days} hari`),
  en: (days) =>
    days < 1 ? "less than 1 day" : days === 1 ? "1 day" : `${days} days`,
};

/** Whole days left until `until`, rounded up, as a phrase such as "5 hari". */
export function formatBillingDaysLeft(
  until: string,
  now: number,
  language: BillingLanguage
): string {
  const left = Date.parse(until) - now;

  return DAY_LABEL[language](left < DAY_MS ? 0 : Math.ceil(left / DAY_MS));
}

/** Share of the paid term still left, from 0 to 1. */
export function billingTermLeft(
  until: string,
  now: number,
  durationDays: number
): number {
  return Math.min(
    1,
    Math.max(0, (Date.parse(until) - now) / (durationDays * DAY_MS))
  );
}

export type BillingBenefit = {
  icon: "chat" | "reminder" | "memory" | "document" | "calendar" | "unlimited";
  text: string;
};

type BillingPitch = {
  hero: Record<
    "disabled" | "trial" | "paid" | "expired",
    { title: (trialDays: number) => string; body: string }
  >;
  planName: string;
  tagline: string;
  afterTrial: string;
  benefits: readonly BillingBenefit[];
  startTrial: (trialDays: number) => string;
  payNow: string;
};

/** Marketing copy for the subscription surfaces; facts match PRODUCT.md. */
export const BILLING_PITCH: Record<BillingLanguage, BillingPitch> = {
  id: {
    hero: {
      disabled: {
        title: () => "Semua fitur terbuka untuk Anda",
        body: "Nikmati Sydia sepenuhnya, tanpa batas waktu.",
      },
      trial: {
        title: (days) => `Selamat! ${days} hari gratis untuk Anda`,
        body: "Tanpa kartu, tanpa pembayaran. Pakai semua fitur Sydia dulu, bayar nanti kalau sudah cocok.",
      },
      paid: {
        title: () => "Terima kasih sudah berlangganan",
        body: "Semua fitur Sydia terbuka untuk Anda.",
      },
      expired: {
        title: () => "Sydia siap membantu Anda lagi",
        body: "Data Anda aman. Berlangganan lagi untuk kembali dibantu Sydia.",
      },
    },
    planName: "Sydia",
    tagline: "Asisten yang ingat dan menindaklanjuti",
    afterTrial: "Setelah itu",
    benefits: [
      {
        icon: "chat",
        text: "Chat lewat WhatsApp, Telegram, atau web. Bisa ketik, bisa kirim suara",
      },
      {
        icon: "reminder",
        text: "Pengingat yang terus mengingatkan sampai selesai",
      },
      {
        icon: "memory",
        text: "Ingatan Sydia bisa Anda ubah atau hapus kapan saja",
      },
      { icon: "document", text: "Bisa membaca invoice, screenshot, dan PDF" },
      {
        icon: "calendar",
        text: "Terhubung ke Google Calendar, plus ringkasan harian",
      },
      { icon: "unlimited", text: "Chat sepuasnya, tanpa batas" },
    ],
    startTrial: (days) => `Mulai ${days} hari gratis`,
    payNow: "Atau langsung berlangganan",
  },
  en: {
    hero: {
      disabled: {
        title: () => "Every feature is open to you",
        body: "Enjoy Sydia fully, with no time limit.",
      },
      trial: {
        title: (days) => `Congratulations! ${days} free days are yours`,
        body: "No card, no payment. Use every Sydia feature first, and pay later if it fits.",
      },
      paid: {
        title: () => "Thank you for subscribing",
        body: "Every Sydia feature is open to you.",
      },
      expired: {
        title: () => "Sydia is ready to help you again",
        body: "Your data is safe. Subscribe again to get Sydia's help back.",
      },
    },
    planName: "Sydia",
    tagline: "The assistant that remembers and follows through",
    afterTrial: "After that",
    benefits: [
      {
        icon: "chat",
        text: "Chat on WhatsApp, Telegram, or the web. Type or send a voice note",
      },
      {
        icon: "reminder",
        text: "Reminders that keep nudging until it is done",
      },
      { icon: "memory", text: "Memory you can edit or delete any time" },
      { icon: "document", text: "Reads invoices, screenshots, and PDFs" },
      {
        icon: "calendar",
        text: "Connects to Google Calendar, plus a daily briefing",
      },
      { icon: "unlimited", text: "Chat as much as you like, no limits" },
    ],
    startTrial: (days) => `Start ${days} free days`,
    payNow: "Or subscribe right away",
  },
};

export function formatBillingDay(
  value: string,
  language: BillingLanguage,
  timezone: string
): string {
  return new Intl.DateTimeFormat(language === "id" ? "id-ID" : "en-GB", {
    dateStyle: "medium",
    timeZone: timezone,
  }).format(new Date(value));
}

const EWALLET_NAMES: Record<string, string> = {
  GOPAY: "GoPay",
  SHOPEEPAY: "ShopeePay",
  LINKAJA: "LinkAja",
};

const titleCase = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

/** Friendly name for a provider channel such as `qris` or `ewallet/DANA`. */
export function formatPaymentMethod(
  method: string | null,
  language: BillingLanguage
): string {
  if (!method) return "Mayar";
  const [type = "", code = ""] = method.split("/");
  const name = EWALLET_NAMES[code.toUpperCase()] ?? code;

  switch (type.toLowerCase()) {
    case "qris":
      return "QRIS";
    case "ewallet":
      return name || "E-wallet";
    case "va":
      return `${language === "id" ? "Transfer bank" : "Bank transfer"}${code ? ` ${titleCase(code)}` : ""}`;
    case "card":
      return language === "id" ? "Kartu" : "Card";
    case "retail":
      return code ? titleCase(code) : "Retail";
    default:
      return method;
  }
}
