import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Pencil, Unplug, UserRound } from "lucide-react";
import { FormError } from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  getWhatsAppQrAsset,
  type WhatsAppLinkCode,
  type WhatsAppQr,
} from "@/lib/services/api/whatsapp/whatsapp.api";
import {
  useCreateWhatsAppLinkCode,
  useCreateWhatsAppQr,
  useReconnectWhatsApp,
  useReplaceWhatsAppOwner,
  useUnlinkWhatsApp,
  whatsappStatusQueryOptions,
} from "@/lib/services/api/whatsapp/whatsapp.queries";
import { IntegrationRow } from "./integration-row";

interface RecoveryActionProps {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}

function RecoveryAction({ children, disabled, onClick }: RecoveryActionProps) {
  return (
    <Button
      variant="link"
      size="sm"
      className="h-9 min-h-9 justify-start px-0 py-2 text-[13px] leading-5 font-medium text-ink-muted underline underline-offset-4"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

interface AccountRowProps {
  label: string;
  number: string;
  assistant?: boolean;
  onEdit: () => void;
  disabled: boolean;
}

function AccountRow({
  label,
  number,
  assistant,
  onEdit,
  disabled,
}: AccountRowProps) {
  return (
    <div className="flex max-w-72 items-center gap-3">
      {assistant ? (
        <img src="/logo.svg" alt="" className="size-5 shrink-0" />
      ) : (
        <UserRound
          className="size-5 shrink-0 text-ink-muted"
          aria-hidden="true"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink-muted">{label}</p>
        <p className="mt-1 text-sm text-ink break-all">+{number}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label={assistant ? "Ganti nomor asisten" : "Ganti nomor pribadi"}
        onClick={onEdit}
        disabled={disabled}
      >
        <Pencil className="size-4" />
      </Button>
    </div>
  );
}

interface QrImageProps {
  attempt: WhatsAppQr;
}

function QrImage({ attempt }: QrImageProps) {
  const asset = useQuery({
    queryKey: ["whatsapp", "qr", attempt.attemptId],
    queryFn: async () => {
      const blob = await getWhatsAppQrAsset(attempt.attemptId);

      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === "string"
            ? resolve(reader.result)
            : reject(new Error("Gambar QR tidak dapat dibaca."));
        reader.onerror = () =>
          reject(new Error("Gambar QR tidak dapat dibaca. Muat kode baru."));
        reader.readAsDataURL(blob);
      });
    },
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  });

  const [decodeError, setDecodeError] = useState(false);
  if (decodeError)
    return (
      <FormError message="Gambar QR tidak dapat ditampilkan. Muat kode baru." />
    );
  if (asset.isError) return <FormError message={asset.error.message} />;

  return asset.data ? (
    <img
      src={asset.data}
      alt="Kode QR untuk menautkan akun WhatsApp asisten"
      width={165}
      height={165}
      className="size-[165px] shrink-0 bg-white object-contain"
      onError={() => {
        console.error("WhatsApp QR image could not be decoded.");
        setDecodeError(true);
      }}
    />
  ) : (
    <div
      className="size-[165px] shrink-0 animate-pulse rounded-sm bg-surface-1"
      role="status"
      aria-label="Memuat gambar QR"
    />
  );
}

type Confirmation = "disconnect" | "assistant" | "owner" | null;

export function WhatsAppIntegrationCard() {
  const [attempt, setAttempt] = useState<WhatsAppQr | null>(null);
  const [code, setCode] = useState<WhatsAppLinkCode | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [copied, setCopied] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const ownerChallengeRequested = useRef(false);
  const statusQuery = useQuery(whatsappStatusQueryOptions());

  const status = statusQuery.data;
  const qrMutation = useCreateWhatsAppQr();
  const linkMutation = useCreateWhatsAppLinkCode();
  const revoke = useUnlinkWhatsApp();
  const reconnect = useReconnectWhatsApp();
  const replaceOwner = useReplaceWhatsAppOwner();
  const busy =
    qrMutation.isPending ||
    linkMutation.isPending ||
    revoke.isPending ||
    reconnect.isPending ||
    replaceOwner.isPending;

  useEffect(() => {
    if (!attempt && !code && !status?.ownerCodeExpiresAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);

    return () => window.clearInterval(timer);
  }, [attempt, code, status?.ownerCodeExpiresAt]);
  useEffect(() => {
    if (
      status?.setupPhase === "owner_verification" &&
      !ownerChallengeRequested.current &&
      status.status === "connected" &&
      (!status.ownerCodeExpiresAt ||
        Date.parse(status.ownerCodeExpiresAt) > Date.now())
    ) {
      ownerChallengeRequested.current = true;
      linkMutation.mutate(undefined, {
        onSuccess: (value) => {
          setNow(Date.now());
          setCode(value);
        },
      });
    }
  }, [
    status?.setupPhase,
    status?.status,
    status?.ownerCodeExpiresAt,
    linkMutation,
  ]);

  function beginQr(refresh = false) {
    setAttempt(null);
    setCode(null);
    setLocalError(null);
    setCopied(false);
    ownerChallengeRequested.current = false;
    qrMutation.mutate(
      { refresh },
      {
        onSuccess: (value) => {
          setNow(Date.now());
          setAttempt(value);
        },
      }
    );
  }

  function makeCode() {
    ownerChallengeRequested.current = true;
    setLocalError(null);
    setCode(null);
    setCopied(false);
    linkMutation.mutate(undefined, {
      onSuccess: (value) => {
        setNow(Date.now());
        setCode(value);
      },
    });
  }

  async function copyCode() {
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code.code);
      setCopied(true);
    } catch (error) {
      console.error("WhatsApp verification copy failed", error);
      setLocalError(
        "Pesan tidak dapat disalin. Pilih dan salin pesan secara manual."
      );
    }
  }

  async function confirmAction() {
    const selected = confirmation;
    setLocalError(null);

    try {
      if (selected === "owner") {
        const value = await replaceOwner.mutateAsync();
        ownerChallengeRequested.current = true;
        setCode(value);
        setNow(Date.now());
      } else {
        await revoke.mutateAsync();
        setAttempt(null);
        setCode(null);
        if (selected === "assistant") beginQr();
      }

      setConfirmation(null);
    } catch (error) {
      console.error("WhatsApp connection change failed", error);
      setLocalError(
        error instanceof Error ? error.message : "Koneksi belum dapat diubah."
      );
    }
  }

  const error =
    localError ??
    qrMutation.error?.message ??
    linkMutation.error?.message ??
    revoke.error?.message ??
    reconnect.error?.message ??
    replaceOwner.error?.message;

  const expiredQr =
    Boolean(attempt && Date.parse(attempt.expiresAt) <= now) ||
    status?.setupPhase === "qr_expired";

  const challengeExpiresAt = code?.expiresAt ?? status?.ownerCodeExpiresAt;
  const expiredCode = Boolean(
    challengeExpiresAt && Date.parse(challengeExpiresAt) <= now
  );

  const isPairing =
    !status?.assistantNumber &&
    (attempt ||
      qrMutation.isPending ||
      expiredQr ||
      status?.setupPhase === "qr_error" ||
      status?.setupPhase === "pairing");

  const ownerVerification = status?.setupPhase === "owner_verification";
  const stateLabel = status?.connected
    ? "Terhubung"
    : status?.status === "enforced"
      ? "Pengiriman dibatasi"
      : status?.status === "logged_out"
        ? "Sesi berakhir"
        : status?.linked
          ? "Koneksi terputus"
          : ownerVerification
            ? expiredCode
              ? `Verifikasi kedaluwarsa · +${status.assistantNumber}`
              : "Akun asisten tertaut · Verifikasi nomor pribadi"
            : isPairing
              ? "Menunggu pemindaian QR"
              : "Mengobrol dan menerima pengingat melalui WhatsApp.";

  return (
    <IntegrationRow
      id="integration-whatsapp"
      title="WhatsApp"
      logoSrc="/images/brands/whatsapp-circle.svg"
      checked={Boolean(status?.linked)}
      disabled={statusQuery.isPending || statusQuery.isError || busy}
      onCheckedChange={(checked) => {
        if (checked) beginQr();
        else setConfirmation("disconnect");
      }}
      description={
        statusQuery.isPending ? (
          <span role="status">Memeriksa koneksi…</span>
        ) : (
          stateLabel
        )
      }
    >
      <div className="space-y-3 sm:ml-11">
        {statusQuery.isError ? (
          <>
            <FormError message={statusQuery.error.message} />
            <RecoveryAction onClick={() => void statusQuery.refetch()}>
              Coba lagi
            </RecoveryAction>
          </>
        ) : null}
        {isPairing ? (
          <div className="space-y-3">
            {attempt && !expiredQr ? (
              <div className="flex flex-col gap-7 pt-1 sm:flex-row sm:items-start">
                <QrImage key={attempt.attemptId} attempt={attempt} />
                <div className="space-y-3 text-[13px] leading-5 text-ink-muted sm:pt-3">
                  <h4 className="text-sm font-semibold text-ink">
                    Pindai dari akun WhatsApp asisten
                  </h4>
                  <p>
                    Di WhatsApp nomor asisten: Perangkat tertaut
                    <br className="hidden sm:block" /> → Tautkan perangkat.
                    Arahkan kamera ke QR ini.
                  </p>
                  <p className="sm:hidden">
                    Tampilkan Sydia di layar lain agar QR dapat dipindai dari
                    ponsel akun asisten.
                  </p>
                  <div className="flex flex-wrap gap-4">
                    <RecoveryAction
                      disabled={busy}
                      onClick={() => beginQr(true)}
                    >
                      Perbarui QR
                    </RecoveryAction>
                    <RecoveryAction
                      disabled={busy}
                      onClick={() =>
                        revoke.mutate(undefined, {
                          onSuccess: () => {
                            setAttempt(null);
                            setCode(null);
                          },
                        })
                      }
                    >
                      Batal
                    </RecoveryAction>
                  </div>
                  <p className="text-xs" role="status">
                    Menunggu konfirmasi WhatsApp…
                  </p>
                </div>
              </div>
            ) : (
              <>
                <h4 className="text-sm font-semibold text-ink">
                  {qrMutation.isPending
                    ? "Menyiapkan kode QR…"
                    : expiredQr
                      ? "Kode QR kedaluwarsa"
                      : "Kode QR belum tersedia"}
                </h4>
                {qrMutation.isPending ? (
                  <div className="flex items-center gap-5" role="status">
                    <div className="size-[165px] shrink-0 animate-pulse rounded-sm bg-surface-1" />
                    <p className="text-sm text-ink-muted">
                      Kode QR sedang dimuat.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-ink-muted">
                    Muat kode QR baru untuk menautkan akun asisten.
                  </p>
                )}
                <div className="flex flex-wrap gap-4">
                  <RecoveryAction disabled={busy} onClick={() => beginQr(true)}>
                    Muat kode QR baru
                  </RecoveryAction>
                  <RecoveryAction
                    disabled={busy}
                    onClick={() =>
                      revoke.mutate(undefined, {
                        onSuccess: () => {
                          setAttempt(null);
                          setCode(null);
                        },
                      })
                    }
                  >
                    Batal
                  </RecoveryAction>
                </div>
              </>
            )}
          </div>
        ) : null}
        {ownerVerification && expiredCode ? (
          <div className="space-y-1 pt-1">
            <p className="text-[13px] leading-5 text-ink-muted">
              Nomor pribadi belum terverifikasi. Buat pesan baru, lalu kirim
              <br className="hidden sm:block" /> dari WhatsApp pribadi Anda.
              Pesan sebelumnya tidak berlaku.
            </p>
            <RecoveryAction disabled={busy} onClick={makeCode}>
              Buat pesan baru
            </RecoveryAction>
          </div>
        ) : ownerVerification ? (
          <div className="space-y-3 pt-4">
            <h4 className="text-sm font-semibold text-ink">
              Verifikasi nomor pribadi Anda
            </h4>
            <p className="text-[13px] leading-5 text-ink-muted">
              Dari WhatsApp pribadi Anda, kirim pesan ini ke asisten{" "}
              <span className="font-medium text-ink">
                +{status.assistantNumber}
              </span>
              .
            </p>
            {code && !expiredCode ? (
              <>
                <div className="flex min-h-12 items-center rounded-sm border border-ink/12 bg-background pl-4">
                  <span className="min-w-0 flex-1 select-all font-mono text-base tracking-wide text-ink">
                    {code.code}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Salin pesan"
                    onClick={() => void copyCode()}
                  >
                    {copied ? <Check /> : <Copy />}
                  </Button>
                </div>
                <p className="text-xs text-ink-muted" role="status">
                  {copied ? "Tersalin. " : ""}Berlaku hingga{" "}
                  {new Intl.DateTimeFormat("id-ID", {
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(code.expiresAt))}
                  . Jangan bagikan pesan ini.
                </p>
                <p className="text-xs text-ink-muted" role="status">
                  Menunggu pesan dari nomor pribadi. Asisten aktif setelah
                  verifikasi selesai.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-ink-muted" role="status">
                  {linkMutation.isPending
                    ? "Menyiapkan pesan verifikasi…"
                    : "Pesan verifikasi belum tersedia. Coba buat pesan baru."}
                </p>
                <RecoveryAction disabled={busy} onClick={makeCode}>
                  Buat pesan baru
                </RecoveryAction>
              </>
            )}
          </div>
        ) : null}
        {status?.connected && status.assistantNumber && status.ownerNumber ? (
          <div className="space-y-3 pb-2">
            <AccountRow
              assistant
              label="Nomor asisten"
              number={status.assistantNumber}
              disabled={busy}
              onEdit={() => setConfirmation("assistant")}
            />
            <AccountRow
              label="Nomor pribadi · Terverifikasi"
              number={status.ownerNumber}
              disabled={busy}
              onEdit={() => setConfirmation("owner")}
            />
          </div>
        ) : null}
        {status?.linked && !status.connected ? (
          <div className="space-y-1">
            <p className="text-sm leading-6 text-ink-muted">
              {status.status === "enforced"
                ? "WhatsApp membatasi akun asisten. Periksa aplikasi WhatsApp pada nomor asisten. Jangan mencoba pairing berulang."
                : status.status === "logged_out"
                  ? "Tautkan kembali akun asisten dan verifikasi nomor pribadi Anda untuk melanjutkan chat dan pengingat."
                  : "Chat dan pengingat tertunda. Setelah terhubung kembali, pengingat terlewat dikirim dalam satu ringkasan."}
            </p>
            {status.reason ? (
              <p className="text-xs leading-5 text-ink-muted" role="status">
                {status.reason}
              </p>
            ) : null}
            {status.status === "enforced" ? (
              <RecoveryAction
                disabled={statusQuery.isFetching}
                onClick={() => void statusQuery.refetch()}
              >
                Periksa status
              </RecoveryAction>
            ) : (
              <RecoveryAction
                disabled={busy}
                onClick={() => {
                  if (status.status === "logged_out")
                    setConfirmation("assistant");
                  else reconnect.mutate();
                }}
              >
                {status.status === "logged_out"
                  ? "Tautkan ulang"
                  : "Hubungkan kembali"}
              </RecoveryAction>
            )}
          </div>
        ) : null}
        {status?.setupPhase === "conflict" ? (
          <div className="space-y-1">
            <p className="text-sm text-ink-muted">
              Nomor asisten ini sudah digunakan akun Sydia lain. Gunakan akun
              WhatsApp yang berbeda.
            </p>
            <RecoveryAction
              disabled={busy}
              onClick={() =>
                revoke.mutate(undefined, { onSuccess: () => beginQr() })
              }
            >
              Gunakan akun lain
            </RecoveryAction>
          </div>
        ) : null}
        {error ? <FormError message={error} /> : null}
      </div>
      <Dialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setConfirmation(null);
            setLocalError(null);
          }
        }}
      >
        {/* The 24px content inset includes the shared 1px border. */}
        <DialogContent className="w-[calc(100%-2.5rem)] max-w-md bg-white p-[23px] text-center">
          <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <Unplug className="size-4" />
          </div>
          <DialogTitle className="leading-[25px]">
            {confirmation === "disconnect"
              ? "Putuskan WhatsApp?"
              : confirmation === "owner"
                ? "Ganti nomor pribadi?"
                : "Ganti nomor WhatsApp?"}
          </DialogTitle>
          <DialogDescription className="mt-1">
            {confirmation === "disconnect"
              ? "Percakapan dan pengingat WhatsApp akan berhenti. Data Anda di Sydia tetap tersimpan. Untuk memakai WhatsApp lagi, hubungkan dan verifikasi ulang."
              : confirmation === "owner"
                ? "Nomor pribadi saat ini akan dilepas. Verifikasi nomor pengganti untuk melanjutkan percakapan dan pengingat."
                : "Koneksi saat ini akan diputus. Hubungkan nomor asisten dan verifikasi nomor pribadi kembali. Data Sydia dan pengaturan Anda tetap tersimpan."}
          </DialogDescription>
          <div className="mt-4 flex justify-center gap-2">
            <Button
              variant="dark-outline"
              size="sm"
              className="h-10 py-2"
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-10 py-2"
              disabled={busy}
              onClick={() => void confirmAction()}
            >
              {busy
                ? "Memproses…"
                : confirmation === "disconnect"
                  ? "Putuskan WhatsApp"
                  : "Lanjutkan ganti nomor"}
            </Button>
          </div>
          {localError ? (
            <div className="mt-3">
              <FormError message={localError} />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </IntegrationRow>
  );
}
