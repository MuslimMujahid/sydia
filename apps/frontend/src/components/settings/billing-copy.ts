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
    create: "Buat tagihan",
    creating: "Menyiapkan tagihan…",
    pay: "Bayar melalui Mayar",
    check: "Periksa pembayaran",
    history: "Riwayat pembayaran",
    empty: "Belum ada pembayaran.",
    storage: "Penyimpanan",
    used: "terpakai dari 10 GB",
    readOnly:
      "Akses baca saja. Data tetap bisa dibaca, diunduh, dan dihapus. Perpanjang untuk kembali menggunakan asisten dan mengubah data.",
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
    create: "Create invoice",
    creating: "Preparing invoice…",
    pay: "Pay with Mayar",
    check: "Check payment",
    history: "Payment history",
    empty: "No payments yet.",
    storage: "Storage",
    used: "used of 10 GB",
    readOnly:
      "Read-only access. You can still read, download, and delete your data. Renew to use the assistant and make changes again.",
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
