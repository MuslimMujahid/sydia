import { useQuery } from "@tanstack/react-query";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Link2,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { EmptyState } from "@/components/app-states";
import {
  DomainInlineError,
  DomainListSkeleton,
  DomainPageHeader,
} from "@/components/domain/domain-page";
import {
  FieldShell,
  FormError,
  TextField,
} from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAppForm } from "@/lib/hooks/forms";
import type {
  RevealedSecret,
  RevealLink,
  SecretMetadata,
} from "@/lib/services/api/secrets/secrets.api";
import {
  secretsQueryOptions,
  useCreateRevealLink,
  useCreateSecret,
  useDeleteSecret,
  useRevealSecretInSession,
  useUnlockSecretVault,
} from "@/lib/services/api/secrets/secrets.queries";
import { formatDateTime } from "@/lib/utils/date-time";

const secretSchema = z.object({
  label: z.string().trim().min(2, "Masukkan label minimal 2 karakter."),
  value: z.string().min(1, "Masukkan nilai rahasia."),
});

function SecretCreator({ onClose }: { onClose: () => void }) {
  const createMutation = useCreateSecret();
  const form = useAppForm({
    defaultValues: { label: "", value: "" },
    validators: { onChange: secretSchema },
    onSubmit: async ({ value }) => {
      await createMutation.mutateAsync({
        label: value.label.trim(),
        value: value.value,
      });
      onClose();
    },
  });

  return (
    <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
      <DialogTitle>Rahasia baru</DialogTitle>
      <DialogDescription className="mt-2">
        Simpan nilai sensitif seperti kata sandi atau kunci API. Nilai disimpan
        terenkripsi dan tidak pernah ditampilkan kembali — Anda membagikannya
        lewat tautan ungkap satu kali.
      </DialogDescription>
      <form
        className="mt-7 space-y-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          createMutation.reset();
          void form.handleSubmit();
        }}
      >
        <form.Field name="label">
          {(field) => (
            <FieldShell
              id="secret-label"
              label="Label"
              description="Nama yang membantu Anda mengenali rahasia ini, misalnya “Kata sandi Wi-Fi kantor”."
              errors={field.state.meta.errors}
            >
              {({ describedBy, invalid }) => (
                <TextField
                  id="secret-label"
                  autoFocus
                  value={field.state.value}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              )}
            </FieldShell>
          )}
        </form.Field>
        <form.Field name="value">
          {(field) => (
            <FieldShell
              id="secret-value"
              label="Nilai rahasia"
              description="Masukkan satu nilai per baris, misalnya email di baris pertama dan kata sandi di baris kedua. Baris baru akan disimpan persis seperti yang dimasukkan."
              errors={field.state.meta.errors}
            >
              {({ describedBy, invalid }) => (
                <Textarea
                  id="secret-value"
                  autoComplete="off"
                  spellCheck={false}
                  rows={4}
                  placeholder={"user@gmail.com\nPassword123"}
                  value={field.state.value}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              )}
            </FieldShell>
          )}
        </form.Field>
        <FormError message={createMutation.error?.message} />
        <div className="flex flex-col-reverse gap-3 border-t border-surface-1 pt-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="dark-outline" onClick={onClose}>
            Batal
          </Button>
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
          >
            {([canSubmit, isSubmitting]) => (
              <Button type="submit" disabled={!canSubmit || isSubmitting}>
                {isSubmitting ? (
                  <LoaderCircle className="animate-spin motion-reduce:animate-none" />
                ) : null}
                {isSubmitting ? "Menyimpan…" : "Simpan rahasia"}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </form>
    </DialogContent>
  );
}

function RevealLinkDialog({
  link,
  secretLabel,
  onClose,
}: {
  link: RevealLink;
  secretLabel: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <DialogContent className="max-w-xl">
      <DialogTitle>Tautan ungkap siap dibagikan</DialogTitle>
      <DialogDescription className="mt-2">
        Tautan untuk “{secretLabel}” hanya dapat dibuka satu kali dan berlaku
        hingga {formatDateTime(link.expiresAt)}.
      </DialogDescription>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="reveal-link-url" className="sr-only">
          Tautan ungkap untuk {secretLabel}
        </label>
        <Input
          id="reveal-link-url"
          readOnly
          value={link.url}
          onFocus={(event) => event.target.select()}
        />
        <Button
          type="button"
          variant="dark-outline"
          className="shrink-0"
          onClick={() => void copyLink()}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "Tersalin" : "Salin tautan"}
        </Button>
      </div>
      <p className="mt-4 text-sm text-ink-muted">
        Siapa pun yang membuka tautan ini dapat melihat nilai rahasia. Bagikan
        hanya kepada penerima yang Anda maksud.
      </p>
      <div aria-live="polite" className="sr-only">
        {copied ? "Tautan tersalin ke papan klip." : null}
      </div>
      <div className="mt-6 flex justify-end border-t border-surface-1 pt-5">
        <Button type="button" variant="dark-outline" onClick={onClose}>
          Tutup
        </Button>
      </div>
    </DialogContent>
  );
}

function DirectRevealDialog({
  secret,
  unlocked,
  onUnlocked,
  onClose,
}: {
  secret: SecretMetadata;
  unlocked: boolean;
  onUnlocked: () => void;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState<RevealedSecret | null>(null);
  const [copied, setCopied] = useState(false);
  const valueRef = useRef<string | null>(null);
  const unlockMutation = useUnlockSecretVault();
  const revealMutation = useRevealSecretInSession();
  const autoRevealStarted = useRef(false);

  useEffect(() => {
    if (!unlocked || autoRevealStarted.current) return;
    autoRevealStarted.current = true;
    void revealMutation
      .mutateAsync(secret.id)
      .then((value) => {
        valueRef.current = value.value;
        setRevealed(value);
      })
      .catch(() => {
        autoRevealStarted.current = false;
      });
  }, [revealMutation, secret.id, unlocked]);

  useEffect(() => {
    if (!revealed) return;
    const timeout = window.setTimeout(() => {
      valueRef.current = null;
      setRevealed(null);
    }, 30_000);

    return () => window.clearTimeout(timeout);
  }, [revealed]);

  useEffect(
    () => () => {
      valueRef.current = null;
    },
    []
  );

  async function reveal() {
    if (!unlocked) {
      await unlockMutation.mutateAsync(password);
      autoRevealStarted.current = true;
      onUnlocked();
    }

    const value = await revealMutation.mutateAsync(secret.id);
    valueRef.current = value.value;
    setRevealed(value);
    setPassword("");
  }

  async function copyValue() {
    if (!valueRef.current) return;
    await navigator.clipboard.writeText(valueRef.current);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  function close() {
    valueRef.current = null;
    setRevealed(null);
    onClose();
  }

  const error = unlockMutation.error ?? revealMutation.error;

  return (
    <DialogContent className="max-w-xl">
      <DialogTitle>
        {revealed
          ? secret.label
          : unlocked
            ? "Membuka rahasia…"
            : "Tampilkan rahasia"}
      </DialogTitle>
      <DialogDescription className="mt-2">
        {unlocked
          ? "Nilai sedang dibuka dan akan disembunyikan otomatis setelah 30 detik."
          : "Konfirmasikan kata sandi akun sekali untuk membuka semua rahasia selama sesi ini."}
      </DialogDescription>
      {revealed ? (
        <>
          <div className="mt-6 rounded-md border border-ink/10 bg-surface-1 p-4">
            <p className="font-mono text-sm break-all whitespace-pre-wrap text-ink">
              {revealed.value}
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => void copyValue()}>
              {copied ? <Check /> : <Copy />}
              {copied ? "Tersalin" : "Salin nilai"}
            </Button>
            <Button variant="ghost" onClick={close}>
              <EyeOff /> Sembunyikan
            </Button>
          </div>
        </>
      ) : unlocked ? (
        <div
          className="mt-6 flex items-center gap-3 text-ink-muted"
          aria-live="polite"
        >
          <LoaderCircle className="animate-spin motion-reduce:animate-none" />
          Membuka nilai rahasia…
          <FormError message={revealMutation.error?.message} />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="vault-password"
              className="mb-2 block font-semibold"
            >
              Kata sandi akun
            </label>
            <Input
              id="vault-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <FormError message={error?.message} />
          <div className="flex justify-end gap-3">
            <Button variant="dark-outline" onClick={close}>
              Batal
            </Button>
            <Button
              disabled={!password || unlockMutation.isPending}
              onClick={() => void reveal()}
            >
              <Eye /> {unlockMutation.isPending ? "Membuka…" : "Tampilkan"}
            </Button>
          </div>
        </div>
      )}
    </DialogContent>
  );
}

function SecretRow({
  secret,
  onCreateLink,
  onReveal,
  onDelete,
  linkPending,
  deletePending,
}: {
  secret: SecretMetadata;
  onCreateLink: () => void;
  onReveal: () => void;
  onDelete: () => void;
  linkPending: boolean;
  deletePending: boolean;
}) {
  return (
    <li className="grid gap-3 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <span className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-1">
            <KeyRound className="size-4 text-brand-deep" />
          </span>
          <span className="truncate font-display font-bold">
            {secret.label}
          </span>
        </span>
        <p className="mt-2 pl-12 text-sm text-ink-muted">
          Dibuat {formatDateTime(secret.createdAt)} · Diungkap{" "}
          {secret.revealCount} kali
          {secret.lastRevealedAt
            ? ` · Terakhir ${formatDateTime(secret.lastRevealedAt)}`
            : " · Belum pernah diungkap"}
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Tindakan untuk ${secret.label}`}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onReveal}>
            <Eye /> Tampilkan rahasia
          </DropdownMenuItem>
          <DropdownMenuItem disabled={linkPending} onClick={onCreateLink}>
            <Link2 /> Buat tautan ungkap
          </DropdownMenuItem>
          <DropdownMenuItem
            destructive
            disabled={deletePending}
            onClick={onDelete}
          >
            <Trash2 /> Hapus rahasia
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

export function SecretsPage() {
  const [creating, setCreating] = useState(false);
  const [issuedLink, setIssuedLink] = useState<{
    link: RevealLink;
    secretLabel: string;
  } | null>(null);

  const [revealTarget, setRevealTarget] = useState<SecretMetadata | null>(null);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);

  const query = useQuery(secretsQueryOptions());
  const deleteMutation = useDeleteSecret();
  const revealLinkMutation = useCreateRevealLink();

  async function handleCreateLink(secret: SecretMetadata) {
    const link = await revealLinkMutation.mutateAsync(secret.id);
    setIssuedLink({ link, secretLabel: secret.label });
  }

  async function handleDelete(secret: SecretMetadata) {
    if (!window.confirm(`Hapus rahasia “${secret.label}” secara permanen?`))
      return;
    await deleteMutation.mutateAsync(secret.id);
  }

  return (
    <div className="space-y-8">
      <DomainPageHeader
        title="Rahasia"
        description="Cara termudah menyimpan rahasia adalah lewat chat — cukup kirim ke Sydia dan ia menyimpannya terenkripsi. Halaman ini mengelola label, membuat tautan ungkap satu kali, dan menghapus rahasia; nilai yang tersimpan tidak pernah ditampilkan di sini."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus /> Tambah rahasia
          </Button>
        }
      />
      {query.isPending ? <DomainListSkeleton label="Memuat rahasia" /> : null}
      {query.isError ? (
        <DomainInlineError
          title="Rahasia tidak dapat dimuat"
          message={query.error.message}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.isSuccess && !query.data.length ? (
        <EmptyState
          title="Belum ada rahasia"
          message="Kirim kata sandi atau catatan sensitif lewat chat, atau gunakan aksi Tambah rahasia di bagian atas. Anda membagikannya nanti lewat tautan ungkap satu kali."
        />
      ) : null}
      {query.isSuccess && query.data.length ? (
        <ul className="divide-y divide-surface-1 border-y border-surface-1">
          {query.data.map((secret) => (
            <SecretRow
              key={secret.id}
              secret={secret}
              linkPending={
                revealLinkMutation.isPending &&
                revealLinkMutation.variables === secret.id
              }
              deletePending={
                deleteMutation.isPending &&
                deleteMutation.variables === secret.id
              }
              onCreateLink={() => void handleCreateLink(secret)}
              onReveal={() => setRevealTarget(secret)}
              onDelete={() => void handleDelete(secret)}
            />
          ))}
        </ul>
      ) : null}
      <FormError
        message={
          revealLinkMutation.error?.message ?? deleteMutation.error?.message
        }
      />
      <Dialog
        open={creating}
        onOpenChange={(open) => !open && setCreating(false)}
      >
        {creating ? <SecretCreator onClose={() => setCreating(false)} /> : null}
      </Dialog>
      <Dialog
        open={Boolean(issuedLink)}
        onOpenChange={(open) => !open && setIssuedLink(null)}
      >
        {issuedLink ? (
          <RevealLinkDialog
            link={issuedLink.link}
            secretLabel={issuedLink.secretLabel}
            onClose={() => setIssuedLink(null)}
          />
        ) : null}
      </Dialog>
      <Dialog
        open={Boolean(revealTarget)}
        onOpenChange={(open) => !open && setRevealTarget(null)}
      >
        {revealTarget ? (
          <DirectRevealDialog
            secret={revealTarget}
            unlocked={vaultUnlocked}
            onUnlocked={() => setVaultUnlocked(true)}
            onClose={() => setRevealTarget(null)}
          />
        ) : null}
      </Dialog>
    </div>
  );
}
