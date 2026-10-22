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
