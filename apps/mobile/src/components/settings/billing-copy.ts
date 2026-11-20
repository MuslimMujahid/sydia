/**
 * Subscription copy and formatting, ported from
 * apps/frontend/src/components/settings/billing-copy.ts. Keep the wording in
 * step with the web so both surfaces describe the plan the same way.
 */
export type BillingLanguage = "id" | "en";

export function billingLanguage(locale: string): BillingLanguage {
  return locale === "en" ? "en" : "id";
}

export type BillingOrderStatus =
  "creating" | "pending" | "paid" | "review" | "failed" | "expired";

type BillingCopy = {
  title: string;
  normal: string;
  phone: string;
  phoneHelp: string;
  subscribe: string;
  renew: string;
  paidNotice: string;
  renewHint: string;
  create: string;
  creating: string;
  pay: string;
  check: string;
  history: string;
  storage: string;
  used: string;
  plan: string;
  review: string;
  unavailable: string;
  retry: string;
  loading: string;
  sandbox: string;
  settings: {
    trialTitle: (left: string) => string;
    trialBody: string;
    paidTitle: string;
    paidBody: string;
    remaining: (left: string) => string;
    expiredTitle: string;
    expiredBody: string;
    resubscribe: string;
    discount: (percent: number) => string;
    perTerm: string;
    benefits: string;
    manageStorage: string;
    fileLimit: string;
    emptyHistory: string;
  };
  order: Record<BillingOrderStatus, string>;
};

export const BILLING_COPY: Record<BillingLanguage, BillingCopy> = {
  id: {
    title: "Langganan",
    normal: "Harga normal",
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
    storage: "Penyimpanan",
    used: "dari 10 GB terpakai",
    plan: "Sydia Plus",
    review:
      "Tagihan ini sedang diperiksa. Hubungi dukungan Sydia dan jangan membuat pembayaran ulang.",
    unavailable: "Pembayaran belum tersedia. Hubungi dukungan Sydia.",
    retry: "Coba lagi",
    loading: "Memuat langganan…",
    sandbox: "Mode uji — pembayaran sandbox",
    settings: {
      trialTitle: (left) => `Trial aktif, sisa ${left}`,
      trialBody:
        "Berlangganan sebelum trial berakhir agar Sydia tetap bisa digunakan.",
      paidTitle: "Sydia Plus aktif",
      paidBody: "Semua fitur Sydia terbuka untuk Anda.",
      remaining: (left) => `Sisa ${left}`,
      expiredTitle: "Masa aktif Anda sudah berakhir",
      expiredBody:
        "Data Anda aman dan tetap bisa dibaca, diunduh, atau dihapus. Berlangganan lagi untuk kembali menggunakan Sydia.",
      resubscribe: "Berlangganan lagi",
      discount: (percent) => `Diskon ${percent}%`,
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
    normal: "Regular price",
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
    storage: "Storage",
    used: "of 10 GB used",
    plan: "Sydia Plus",
    review:
      "This invoice needs review. Contact Sydia support and do not make another payment.",
    unavailable: "Payments are not available yet. Contact Sydia support.",
    retry: "Try again",
    loading: "Loading subscription…",
    sandbox: "Test mode — sandbox payments",
    settings: {
      trialTitle: (left) => `Trial active, ${left} left`,
      trialBody:
        "Subscribe before your trial ends so Sydia stays available to you.",
      paidTitle: "Sydia Plus is active",
      paidBody: "Every Sydia feature is open to you.",
      remaining: (left) => `${left} left`,
      expiredTitle: "Your access has ended",
      expiredBody:
        "Your data is safe and you can still read, download, or delete it. Subscribe again to keep using Sydia.",
      resubscribe: "Subscribe again",
      discount: (percent) => `${percent}% off`,
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

export type BillingBenefit = {
  icon: "chat" | "reminder" | "memory" | "document" | "calendar" | "unlimited";
  text: string;
};

type BillingPitch = {
  disabled: { title: string; body: string };
  benefits: readonly BillingBenefit[];
};

/** Marketing copy for the subscription surfaces; facts match the web. */
export const BILLING_PITCH: Record<BillingLanguage, BillingPitch> = {
  id: {
    disabled: {
      title: "Semua fitur terbuka untuk Anda",
      body: "Nikmati Sydia sepenuhnya, tanpa batas waktu.",
    },
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
  },
  en: {
    disabled: {
      title: "Every feature is open to you",
      body: "Enjoy Sydia fully, with no time limit.",
    },
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

const DAY_MS = 86_400_000;

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

/** Whole-percent discount from the normal price; 0 when there is none. */
export function billingDiscountPercent(price: number, normalPrice: number) {
  if (normalPrice <= 0 || price >= normalPrice) return 0;

  return Math.floor((1 - price / normalPrice) * 100);
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

/** The web's checkout field pattern: digits, spaces, +, (, ), -; 8–24 long. */
export function isBillingPhone(value: string): boolean {
  return /^[+0-9 ()-]{8,24}$/.test(value.trim());
}

/** Gigabytes with one or two decimals, for the storage meter. */
export function formatGigabytes(
  bytes: number,
  language: BillingLanguage
): string {
  return new Intl.NumberFormat(language === "id" ? "id-ID" : "en-US", {
    maximumFractionDigits: 2,
  }).format(bytes / 1_000_000_000);
}
