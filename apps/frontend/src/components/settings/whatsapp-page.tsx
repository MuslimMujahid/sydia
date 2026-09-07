import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Link2,
  MessageSquareText,
  ShieldAlert,
  Unplug,
} from "lucide-react";
import { DomainInlineError } from "@/components/domain/domain-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormError } from "@/components/forms/form-fields";
import {
  useCreateWhatsAppLinkCode,
  usePairWhatsAppCompanion,
  useUnlinkWhatsApp,
  whatsappStatusQueryOptions,
} from "@/lib/services/api/whatsapp/whatsapp.queries";
import type {
  WhatsAppCompanionPairCode,
  WhatsAppGatewayState,
  WhatsAppLinkCode,
  WhatsAppStatus,
} from "@/lib/services/api/whatsapp/whatsapp.api";
import { SettingsPageHeader } from "./settings-nav";

const GATEWAY_LABELS: Record<
  WhatsAppGatewayState,
  { label: string; dot: "brand" | "warn" | "destructive" | "ink-weak" }
> = {
  connected: { label: "Gateway terhubung", dot: "brand" },
  connecting: { label: "Gateway menyambung…", dot: "ink-weak" },
  disconnected: { label: "Gateway terputus", dot: "warn" },
  awaiting_pair: { label: "Menunggu pasangan WhatsApp", dot: "warn" },
  enforced: { label: "Pengiriman dijeda", dot: "destructive" },
  logged_out: { label: "Gateway keluar", dot: "destructive" },
};

function gatewayLabel(state: string) {
  return (
    GATEWAY_LABELS[state as WhatsAppGatewayState] ?? {
      label: "Status gateway tidak diketahui",
      dot: "ink-weak" as const,
    }
  );
}

function phoneFromJid(externalId: string): string {
  const local = externalId.split("@")[0] ?? externalId;

  return local.split(":")[0] ?? local;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatClock(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function StatusSkeleton() {
  return (
    <div
      className="space-y-4"
      aria-busy="true"
      aria-label="Memuat status WhatsApp"
    >
      {[0, 1].map((row) => (
        <span
          key={row}
          className="block h-28 animate-pulse rounded-lg bg-surface-1 motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}

function GatewayBadge({ status }: { status: WhatsAppStatus }) {
  const gateway = gatewayLabel(status.gateway.status);

  return (
    <Badge dot={gateway.dot} role="status">
      {gateway.label}
    </Badge>
  );
}

function EnforcementNotice({
  status,
  operator = false,
}: {
  status: WhatsAppStatus;
  operator?: boolean;
}) {
  const enforcementReason = status.gateway.enforcementReason;
  const recoveryReason = status.gateway.recoveryReason;
  if (!enforcementReason && !recoveryReason) return null;

  return (
    <div className="space-y-4">
      {enforcementReason ? (
        <Card className="border-destructive/40 p-6" role="alert">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div>
              <h2 className="font-display text-[17px] leading-[1.6] font-semibold">
                Pengiriman WhatsApp dijeda
              </h2>
              <p className="mt-2 text-ink-muted">{enforcementReason}</p>
              <p className="mt-2 text-sm text-ink-muted">
                {operator
                  ? "Jangan mencoba pairing atau login ulang sampai pembatasan ditinjau dan dipulihkan."
                  : "Pesan dari Sydia akan tetap dijeda sampai operator memulihkan nomor layanan."}
              </p>
            </div>
          </div>
        </Card>
      ) : null}
      {recoveryReason ? (
        <Card className="border-warn/40 p-6" role="alert">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warn" />
            <div>
              <h2 className="font-display text-[17px] leading-[1.6] font-semibold">
                Koneksi perlu dipulihkan
              </h2>
              <p className="mt-2 text-ink-muted">{recoveryReason}</p>
              <p className="mt-2 text-sm text-ink-muted">
                {operator
                  ? "Periksa sesi nomor WhatsApp Sydia. Hindari percobaan koneksi berulang."
                  : "Anda tidak perlu menautkan ulang nomor pribadi. Operator Sydia sedang menangani koneksi layanan."}
              </p>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function LinkedIdentityCard({ status }: { status: WhatsAppStatus }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const unlinkMutation = useUnlinkWhatsApp();
  const externalId = status.externalId;
  const contact = status.contact;

  async function handleUnlink() {
    await unlinkMutation.mutateAsync();
    setDialogOpen(false);
  }

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xl">
          <h2 className="font-display text-[17px] leading-[1.6] font-semibold">
            Identitas tertaut
          </h2>
          <dl className="mt-4 space-y-3 text-[15px]">
            {externalId ? (
              <>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <dt className="text-ink-muted">Nomor WhatsApp</dt>
                  <dd className="font-semibold text-ink">
                    {phoneFromJid(externalId)}
                  </dd>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <dt className="text-ink-muted">JID</dt>
                  <dd className="font-mono text-sm text-ink-muted">
                    {externalId}
                  </dd>
                </div>
              </>
            ) : null}
            {contact?.lastInboundAt ? (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <dt className="text-ink-muted">Pesan masuk terakhir</dt>
                <dd className="text-ink">
                  <time dateTime={contact.lastInboundAt}>
                    {formatDateTime(contact.lastInboundAt)}
                  </time>
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={
              <Button variant="dark-outline" size="sm" className="shrink-0" />
            }
          >
            {" "}
            <Unplug /> Putuskan tautan
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Putuskan tautan WhatsApp?</DialogTitle>
            <DialogDescription className="mt-3">
              Sydia berhenti mengaitkan pesan dari nomor pribadi ini dengan akun
              Anda dan tidak akan mengirim pesan proaktif ke nomor tersebut.
              Nomor layanan Sydia tetap sama dan tetap tersedia bagi pengguna
              lain. Anda dapat menautkan ulang kapan pun dengan kode baru.
            </DialogDescription>
            {unlinkMutation.error ? (
              <div className="mt-4">
                <FormError message={unlinkMutation.error.message} />
              </div>
            ) : null}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                variant="ghost"
                size="sm"
                disabled={unlinkMutation.isPending}
                onClick={() => setDialogOpen(false)}
              >
                Batal
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={unlinkMutation.isPending}
                onClick={() => void handleUnlink()}
              >
                {unlinkMutation.isPending
                  ? "Memutuskan…"
                  : "Ya, putuskan tautan"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {contact?.optedOutAt ? (
        <div
          className="mt-6 border-l-2 border-destructive bg-destructive/5 px-4 py-3"
          role="alert"
        >
          <p className="text-sm text-ink">
            Anda mengirim STOP pada {formatDateTime(contact.optedOutAt)}. Sydia
            tidak akan mengirim pesan keluar ke nomor Anda sampai Anda mengirim
            pesan baru ke Sydia terlebih dahulu.
          </p>
        </div>
      ) : null}
    </Card>
  );
}

function LinkCodeCard({
  status,
  linkCode,
  codeActive,
  onCodeCreated,
}: {
  status: WhatsAppStatus;
  linkCode: WhatsAppLinkCode | null;
  codeActive: boolean;
  onCodeCreated: (code: WhatsAppLinkCode | null) => void;
}) {
  const linkCodeMutation = useCreateWhatsAppLinkCode();

  const enforcementActive =
    status.gateway.sendingPaused ||
    status.gateway.status === "enforced" ||
    Boolean(status.gateway.enforcementReason);

  async function handleCreateCode() {
    const code = await linkCodeMutation.mutateAsync();
    onCodeCreated(code);
  }

  return (
    <Card className="p-6 sm:p-8">
      <h2 className="font-display text-[17px] leading-[1.6] font-semibold">
        Tautkan akun WhatsApp Anda
      </h2>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-[15px] text-ink-muted">
        <li>Buat kode tautan sekali pakai di bawah.</li>
        <li>
          Kirim kode tersebut sebagai pesan WhatsApp dari nomor Anda ke nomor
          Sydia.
        </li>
        <li>Status di halaman ini diperbarui otomatis begitu kode diterima.</li>
      </ol>
      <p className="mt-4 text-sm text-ink-muted">
        Demi keamanan, kode hanya berlaku beberapa menit dan hanya dapat dipakai
        dari pesan masuk WhatsApp — bukan dari web.
      </p>
      {codeActive && linkCode ? (
        <div className="mt-6 space-y-3" aria-live="polite">
          <p className="text-sm font-semibold text-ink">Kode tautan Anda</p>
          <p className="w-fit rounded-md border border-ink/16 bg-surface-1 px-5 py-3 font-mono text-2xl font-bold tracking-[0.3em]">
            {linkCode.code}
          </p>
          <p className="text-sm text-ink-muted">
            Berlaku sampai pukul{" "}
            <time dateTime={linkCode.expiresAt}>
              {formatClock(linkCode.expiresAt)}
            </time>
            . Menunggu kode dikirim dari WhatsApp Anda…
          </p>
        </div>
      ) : null}
      {linkCode && !codeActive && !status.linked ? (
        <p className="mt-6 text-sm text-ink-muted" role="status">
          Kode sebelumnya kedaluwarsa. Buat kode baru untuk melanjutkan.
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button
          size="sm"
          disabled={linkCodeMutation.isPending || enforcementActive}
          onClick={() => void handleCreateCode()}
        >
          <Link2 />
          {linkCodeMutation.isPending
            ? "Membuat kode…"
            : codeActive
              ? "Buat kode baru"
              : "Buat kode tautan"}
        </Button>
        {enforcementActive ? (
          <p className="text-sm text-ink-muted">
            Pembuatan kode dijeda selama penegakan aktif.
          </p>
        ) : null}
      </div>
      {linkCodeMutation.error ? (
        <div className="mt-4">
          <FormError message={linkCodeMutation.error.message} />
        </div>
      ) : null}
    </Card>
  );
}

function SydiaNumberSetupCard({ status }: { status: WhatsAppStatus }) {
  const pairMutation = usePairWhatsAppCompanion();
  const [phone, setPhone] = useState("");
  const [pairCode, setPairCode] = useState<WhatsAppCompanionPairCode | null>(
    null
  );

  const validPhone = /^\d{8,15}$/.test(phone);
  const pairingBlocked =
    status.gateway.sendingPaused || status.gateway.status === "enforced";

  async function handlePair() {
    if (!validPhone) return;
    setPairCode(await pairMutation.mutateAsync(phone));
  }

  return (
    <Card className="border-brand/25 bg-brand/4 p-6 sm:p-8">
      <div className="flex items-start gap-3">
        <Link2 className="mt-0.5 size-5 shrink-0 text-brand-deep" />
        <div className="min-w-0">
          <h2 className="font-display text-[17px] leading-[1.6] font-semibold">
            Hubungkan nomor WhatsApp Sydia
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            Nomor ini adalah satu-satunya nomor WhatsApp resmi Sydia. Semua
            pengguna mengirim pesan ke nomor yang sama.
          </p>
        </div>
      </div>
      <p className="mt-4 text-sm text-ink-muted">
        Pastikan nomor sudah terdaftar minimal 24 jam dan profil WhatsApp Sydia
        sudah dilengkapi dengan nama, foto, dan bio sebelum dihubungkan.
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label
          className="flex-1 text-sm font-medium text-ink"
          htmlFor="sydia-phone"
        >
          Nomor WhatsApp Sydia (8–15 digit, tanpa +)
          <Input
            id="sydia-phone"
            className="mt-2"
            inputMode="numeric"
            autoComplete="tel"
            value={phone}
            onChange={(event) =>
              setPhone(event.target.value.replace(/\D/g, "").slice(0, 15))
            }
            placeholder="628123456789"
          />
        </label>
        <Button
          size="sm"
          disabled={!validPhone || pairMutation.isPending || pairingBlocked}
          onClick={() => void handlePair()}
        >
          {pairMutation.isPending ? "Meminta kode…" : "Hubungkan nomor Sydia"}
        </Button>
      </div>
      {!validPhone && phone.length > 0 ? (
        <p className="mt-2 text-sm text-destructive" role="status">
          Masukkan 8–15 digit angka tanpa tanda +.
        </p>
      ) : null}
      {pairMutation.error ? (
        <div className="mt-4">
          <FormError message={pairMutation.error.message} />
        </div>
      ) : null}
      {pairingBlocked ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          Pairing dijeda karena status penegakan WhatsApp. Jangan mencoba
          menghubungkan ulang sampai status dipulihkan oleh operator.
        </p>
      ) : null}
      {pairCode ? (
        <div
          className="mt-6 rounded-md border border-brand/30 bg-canvas p-4"
          aria-live="polite"
        >
          <p className="text-sm font-semibold text-ink">
            Kode pairing nomor Sydia
          </p>
          <p className="mt-2 w-fit rounded-md bg-brand/10 px-5 py-3 font-mono text-3xl font-bold tracking-[0.28em] text-brand-deep">
            {pairCode.code}
          </p>
          <p className="mt-3 text-sm font-semibold text-destructive">
            Kode kedaluwarsa dalam sekitar 60 detik — segera masukkan sekarang.
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink-muted">
            <li>Buka WhatsApp pada ponsel yang memakai nomor Sydia.</li>
            <li>Pilih Perangkat tertaut lalu Tautkan dengan nomor telepon.</li>
            <li>Masukkan kode pairing di atas.</li>
          </ol>
        </div>
      ) : null}
    </Card>
  );
}

export function UserWhatsAppSettingsPage() {
  const [linkCode, setLinkCode] = useState<WhatsAppLinkCode | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const codeAwaitingLink = Boolean(
    linkCode && Date.parse(linkCode.expiresAt) > now
  );

  const statusQuery = useQuery(whatsappStatusQueryOptions(codeAwaitingLink));
  const status = statusQuery.data;

  useEffect(() => {
    if (!codeAwaitingLink) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);

    return () => window.clearInterval(timer);
  }, [codeAwaitingLink]);

  return (
    <div className="max-w-3xl space-y-10">
      <SettingsPageHeader
        section="WhatsApp"
        title="Akun WhatsApp Anda"
        description="Tautkan nomor WhatsApp pribadi Anda sebagai identitas akun. Setelah tertaut, kirim pesan ke satu nomor WhatsApp Sydia yang digunakan bersama oleh semua pengguna."
      />
      {statusQuery.isPending ? <StatusSkeleton /> : null}
      {statusQuery.isError ? (
        <DomainInlineError
          title="Status WhatsApp tidak dapat dimuat"
          message={statusQuery.error.message}
          onRetry={() => void statusQuery.refetch()}
        />
      ) : null}
      {status ? (
        <>
          <Badge dot={status.linked ? "brand" : "ink-weak"}>
            {status.linked
              ? "Nomor pribadi tertaut"
              : "Nomor pribadi belum tertaut"}
          </Badge>
          {status.linked ? (
            <LinkedIdentityCard status={status} />
          ) : (
            <LinkCodeCard
              status={status}
              linkCode={linkCode}
              codeActive={codeAwaitingLink}
              onCodeCreated={setLinkCode}
            />
          )}
          <Card className="p-6 sm:p-8">
            <div className="flex items-start gap-3">
              <MessageSquareText className="mt-0.5 size-5 shrink-0 text-brand-deep" />
              <div>
                <h2 className="font-display text-[17px] leading-[1.6] font-semibold">
                  Cara kerja nomor WhatsApp
                </h2>
                <p className="mt-2 text-ink-muted">
                  Sydia memiliki satu nomor layanan. Tautan ini hanya memberi
                  tahu Sydia bahwa pesan dari nomor pribadi Anda adalah milik
                  akun ini. Nomor layanan Sydia tidak berubah dan tidak dibuat
                  khusus untuk Anda.
                </p>
              </div>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}

export function AdminWhatsAppPage() {
  const statusQuery = useQuery(whatsappStatusQueryOptions(true));
  const status = statusQuery.data;

  return (
    <div className="max-w-3xl space-y-10">
      <SettingsPageHeader
        section="Operasi WhatsApp"
        title="Nomor WhatsApp Sydia"
        description="Hubungkan dan pantau satu nomor WhatsApp layanan yang digunakan bersama oleh seluruh pengguna Sydia."
      />
      {statusQuery.isPending ? <StatusSkeleton /> : null}
      {statusQuery.isError ? (
        <DomainInlineError
          title="Status nomor Sydia tidak dapat dimuat"
          message={statusQuery.error.message}
          onRetry={() => void statusQuery.refetch()}
        />
      ) : null}
      {status ? (
        <>
          <GatewayBadge status={status} />
          <EnforcementNotice status={status} operator />
          {status.gateway.status === "connected" ? (
            <Card
              className="border-brand/25 bg-brand/4 p-6 sm:p-8"
              role="status"
            >
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-brand-deep" />
                <div>
                  <h2 className="font-display text-[17px] leading-[1.6] font-semibold">
                    Nomor Sydia terhubung
                  </h2>
                  <p className="mt-2 text-ink-muted">
                    Sesi layanan aktif. Semua pesan pengguna masuk melalui nomor
                    WhatsApp Sydia yang sama.
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <SydiaNumberSetupCard status={status} />
          )}
          <Card className="p-6 sm:p-8">
            <h2 className="font-display text-[17px] leading-[1.6] font-semibold">
              Model satu nomor bersama
            </h2>
            <p className="mt-2 text-ink-muted">
              Semua pengguna menghubungi nomor Sydia ini. Identitas nomor
              pengirim dipetakan ke akun masing-masing melalui kode tautan
              pengguna.
            </p>
          </Card>
        </>
      ) : null}
    </div>
  );
}
