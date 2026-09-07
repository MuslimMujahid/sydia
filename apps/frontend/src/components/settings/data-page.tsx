import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Download, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormError, TextField } from "@/components/forms/form-fields";
import { exportUserData } from "@/lib/services/api/users/account.api";
import { useDeleteCurrentAccount } from "@/lib/services/api/users/account.queries";
import { SettingsPageHeader } from "./settings-nav";

const CONFIRMATION_TEXT = "HAPUS";

function ExportDataCard() {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleExport() {
    setError(null);
    setDone(false);
    setIsExporting(true);

    try {
      const blob = await exportUserData();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `sydia-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setDone(true);
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Data Anda tidak dapat diekspor."
      );
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xl">
          <h2 className="font-display text-[17px] leading-[1.6] font-semibold">
            Ekspor data
          </h2>
          <p className="mt-2 text-ink-muted">
            Unduh salinan data Anda — profil, percakapan, tugas, pengingat,
            memori, dan dokumen — sebagai berkas JSON portabel.
          </p>
        </div>
        <Button
          variant="dark-outline"
          size="sm"
          className="shrink-0"
          disabled={isExporting}
          onClick={() => void handleExport()}
        >
          <Download />
          {isExporting ? "Menyiapkan berkas…" : "Unduh data saya"}
        </Button>
      </div>
      {error ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {done ? (
        <p className="mt-4 text-sm text-editorial-deep" role="status">
          Berkas ekspor mulai diunduh. Periksa folder unduhan Anda.
        </p>
      ) : null}
    </Card>
  );
}

function DeleteAccountCard() {
  const navigate = useNavigate();
  const deleteMutation = useDeleteCurrentAccount();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const confirmed = confirmation.trim().toUpperCase() === CONFIRMATION_TEXT;

  async function handleDelete() {
    await deleteMutation.mutateAsync();
    setDialogOpen(false);
    await navigate({ to: "/sign-in", replace: true });
  }

  return (
    <Card className="border-destructive/40 p-6 sm:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xl">
          <h2 className="flex items-center gap-2 font-display text-[17px] font-semibold">
            <TriangleAlert className="size-5 text-destructive" /> Hapus akun
          </h2>
          <p className="mt-2 text-ink-muted">
            Menghapus akun Anda secara permanen: seluruh percakapan, tugas,
            pengingat, memori, dokumen, dan integrasi (termasuk tautan WhatsApp
            dan Google Calendar) ikut dicabut dan dihapus. Tindakan ini tidak
            dapat dibatalkan.
          </p>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);

            if (!open) {
              setConfirmation("");
              deleteMutation.reset();
            }
          }}
        >
          <DialogTrigger
            render={
              <Button variant="destructive" size="sm" className="shrink-0" />
            }
          >
            <Trash2 /> Hapus akun saya
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Hapus akun secara permanen?</DialogTitle>
            <DialogDescription className="mt-3">
              Semua data Anda di Sydia akan dihapus dan tidak dapat
              dikembalikan. Pertimbangkan untuk mengunduh ekspor data terlebih
              dahulu.
            </DialogDescription>
            <div className="mt-5 space-y-2">
              <label
                htmlFor="delete-account-confirmation"
                className="block font-sans text-sm font-semibold text-ink"
              >
                Ketik {CONFIRMATION_TEXT} untuk melanjutkan
              </label>
              <TextField
                id="delete-account-confirmation"
                autoComplete="off"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </div>
            {deleteMutation.error ? (
              <div className="mt-4">
                <FormError message={deleteMutation.error.message} />
              </div>
            ) : null}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button
                variant="ghost"
                size="sm"
                disabled={deleteMutation.isPending}
                onClick={() => setDialogOpen(false)}
              >
                Batal
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={!confirmed || deleteMutation.isPending}
                onClick={() => void handleDelete()}
              >
                {deleteMutation.isPending
                  ? "Menghapus akun…"
                  : "Hapus permanen"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  );
}

export function DataSettingsPage() {
  return (
    <div className="max-w-3xl space-y-10">
      <SettingsPageHeader
        section="Data & akun"
        title="Data & akun"
        description="Unduh salinan data Anda, hapus percakapan individual dari daftar di halaman chat, atau hapus akun secara permanen."
      />
      <ExportDataCard />
      <Card className="p-6 sm:p-8">
        <h2 className="font-display text-[17px] leading-[1.6] font-semibold">
          Hapus percakapan
        </h2>
        <p className="mt-2 text-ink-muted">
          Setiap percakapan di daftar chat memiliki tombol hapus. Menghapus
          percakapan juga menghapus seluruh pesan dan riwayatnya secara
          permanen.
        </p>
      </Card>
      <DeleteAccountCard />
    </div>
  );
}
