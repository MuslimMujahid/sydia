import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Info,
  Loader2,
  MoreVertical,
  Pencil,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { Specimen } from "./section";

function TabsSpecimen() {
  return (
    <Specimen number="10" title="Tab" description="Atur konten terkait.">
      <Tabs defaultValue="chat">
        <TabsList>
          <TabsTab value="chat">Obrolan</TabsTab>
          <TabsTab value="knowledge">Pengetahuan</TabsTab>
          <TabsTab value="settings">Pengaturan</TabsTab>
        </TabsList>
        <TabsPanel value="chat">
          <div className="rounded-md bg-surface-1/50 p-4">
            <p className="font-display text-lg font-bold text-ink">
              Mulai percakapan
            </p>
            <p className="font-sans text-sm leading-[21px] text-ink-muted">
              Tanyakan apa saja kepada Sydia, dari pertanyaan singkat hingga
              proyek kompleks.
            </p>
          </div>
        </TabsPanel>
        <TabsPanel value="knowledge">
          <p className="font-sans text-sm leading-[21px] text-ink-muted">
            Sumber dan memori Anda yang tersimpan ada di sini.
          </p>
        </TabsPanel>
        <TabsPanel value="settings">
          <p className="font-sans text-sm leading-[21px] text-ink-muted">
            Sesuaikan Sydia dengan cara kerja Anda.
          </p>
        </TabsPanel>
      </Tabs>
    </Specimen>
  );
}

const PAGES = [1, 2, 3, 4];

function PaginationSpecimen() {
  return (
    <Specimen number="11" title="Paginasi" description="Jelajahi konten.">
      <nav
        aria-label="Paginasi"
        className="flex items-center justify-center gap-1"
      >
        <button
          type="button"
          aria-label="Halaman sebelumnya"
          className="rounded-sm p-2 text-ink-weak hover:bg-surface-1"
        >
          <ChevronLeft className="size-4" />
        </button>
        {PAGES.map((page) => (
          <button
            key={page}
            type="button"
            aria-current={page === 1 ? "page" : undefined}
            className={`size-8 rounded-sm font-sans text-sm ${page === 1 ? "bg-brand font-semibold text-ink" : "text-ink-soft hover:bg-surface-1"}`}
          >
            {page}
          </button>
        ))}
        <span className="px-1 font-sans text-sm text-ink-weak">…</span>
        <button
          type="button"
          className="size-8 rounded-sm border border-hairline font-sans text-sm text-ink-soft hover:bg-surface-1"
        >
          10
        </button>
        <button
          type="button"
          aria-label="Halaman berikutnya"
          className="rounded-sm p-2 text-ink-weak hover:bg-surface-1"
        >
          <ChevronRight className="size-4" />
        </button>
      </nav>
      <p className="text-center font-sans text-sm text-ink-muted">
        Menampilkan 1–10 dari 94 hasil
      </p>
    </Specimen>
  );
}

function DropdownSpecimen() {
  return (
    <Specimen number="12" title="Menu Dropdown" description="Aksi kontekstual.">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="secondary" size="sm">
              <MoreVertical />
              Aksi lainnya
            </Button>
          }
        />
        <DropdownMenuContent>
          <DropdownMenuItem>
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Copy /> Duplikat
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Share2 /> Bagikan
          </DropdownMenuItem>
          <DropdownMenuItem destructive>
            <Trash2 /> Hapus
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Archive /> Pindahkan ke arsip
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Specimen>
  );
}

const TOASTS = [
  {
    title: "Memori baru ditambahkan",
    body: "Sydia akan mengingat ini.",
    icon: "success",
    dark: true,
  },
  {
    title: "Laporan dibuat",
    body: "Laporan Anda siap dilihat.",
    icon: "info",
    dark: false,
  },
  {
    title: "Anda sedang offline",
    body: "Beberapa fitur mungkin terbatas.",
    icon: "warn",
    dark: false,
  },
] as const;

const toastIcon = { success: CheckCircle2, info: Info, warn: AlertTriangle };

function ToastSpecimen() {
  return (
    <Specimen
      number="13"
      title="Toast"
      description="Umpan balik singkat dan sementara."
    >
      <div className="space-y-2">
        {TOASTS.map((toast) => {
          const Icon = toastIcon[toast.icon];

          return (
            <div
              key={toast.title}
              role="status"
              className={`flex items-start gap-3 rounded-md border p-3 ${toast.dark ? "border-editorial bg-editorial text-canvas" : "border-surface-1 bg-canvas text-ink"}`}
            >
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full ${toast.icon === "success" ? "bg-brand text-ink" : toast.icon === "info" ? "bg-link text-canvas" : "bg-warn text-canvas"}`}
              >
                <Icon className="size-3.5" />
              </span>
              <div className="flex-1">
                <p className="font-sans text-sm font-medium">{toast.title}</p>
                <p
                  className={`font-sans text-xs ${toast.dark ? "text-canvas/70" : "text-ink-muted"}`}
                >
                  {toast.body}
                </p>
              </div>
              <X className="size-3.5" aria-hidden="true" />
            </div>
          );
        })}
      </div>
    </Specimen>
  );
}

const ALERTS = [
  { title: "Perhatian", body: "Sydia terus berkembang. Lihat hal-hal baru." },
  {
    title: "Tindakan diperlukan",
    body: "Verifikasi alamat email Anda untuk melanjutkan.",
  },
  {
    title: "Terjadi kesalahan",
    body: "Kami tidak dapat memproses permintaan Anda. Coba lagi.",
  },
];

function AlertSpecimen() {
  return (
    <Specimen
      number="14"
      title="Peringatan"
      description="Pesan penting yang menetap."
    >
      <div className="space-y-2">
        {ALERTS.map((alert, index) => (
          <div
            key={alert.title}
            role="alert"
            className={`flex items-start gap-3 rounded-md border p-3 ${index === 0 ? "border-link/30 bg-link/5 text-link" : index === 1 ? "border-warn/40 bg-warn/10 text-warn" : "border-destructive/40 bg-destructive/10 text-destructive"}`}
          >
            <Info className="mt-0.5 size-4 shrink-0" />
            <div className="flex-1">
              <p className="font-sans text-sm font-medium">{alert.title}</p>
              <p className="font-sans text-xs text-ink-soft">{alert.body}</p>
            </div>
            <X className="size-3.5 text-ink-weak" aria-hidden="true" />
          </div>
        ))}
      </div>
    </Specimen>
  );
}

function ModalSpecimen() {
  return (
    <Specimen
      number="15"
      title="Modal"
      description="Tugas atau alur kerja yang membutuhkan fokus."
    >
      <Dialog>
        <DialogTrigger
          render={<Button variant="dark">Buat proyek baru</Button>}
        />
        <DialogContent>
          <div className="space-y-4">
            <div className="space-y-1">
              <DialogTitle>Buat proyek baru</DialogTitle>
              <DialogDescription>
                Ubah ide Anda menjadi tindakan bersama Sydia.
              </DialogDescription>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="project-name"
                className="font-sans text-sm text-ink-soft"
              >
                Nama proyek
              </label>
              <Input id="project-name" placeholder="mis. Perencanaan Q2" />
            </div>
            <div className="flex justify-end gap-2">
              <DialogClose
                render={
                  <Button variant="secondary" size="sm">
                    Batal
                  </Button>
                }
              />
              <DialogClose
                render={
                  <Button variant="primary" size="sm">
                    Buat
                  </Button>
                }
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Specimen>
  );
}

function ConfirmDialogSpecimen() {
  return (
    <Specimen
      number="16"
      title="Dialog"
      description="Konfirmasi atau keputusan penting."
    >
      <Dialog>
        <DialogTrigger
          render={
            <Button variant="destructive" size="sm">
              Hapus item ini?
            </Button>
          }
        />
        <DialogContent className="text-center">
          <div className="space-y-4">
            <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-destructive/10">
              <Trash2 className="size-4 text-destructive" />
            </span>
            <div className="space-y-1">
              <DialogTitle>Hapus item ini?</DialogTitle>
              <DialogDescription>
                Tindakan ini tidak dapat dibatalkan.
              </DialogDescription>
            </div>
            <div className="flex justify-center gap-2">
              <DialogClose
                render={
                  <Button variant="secondary" size="sm">
                    Batal
                  </Button>
                }
              />
              <DialogClose
                render={
                  <Button variant="destructive" size="sm">
                    Hapus
                  </Button>
                }
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Specimen>
  );
}

function LoadingSpecimen() {
  return (
    <Specimen
      number="17"
      title="Indikator Pemuatan"
      description="Tampilkan kemajuan dan aktivitas."
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Loader2
            className="size-6 animate-spin text-brand-deep"
            aria-hidden="true"
          />
          <span className="font-sans text-sm text-ink-muted">Memuat…</span>
          <span className="sr-only" role="status">
            Memuat
          </span>
        </div>
        <div
          className="flex items-center gap-2"
          role="status"
          aria-label="Berpikir"
        >
          <span className="flex gap-1" aria-hidden="true">
            <span className="size-2 animate-pulse rounded-full bg-brand-deep" />
            <span className="size-2 animate-pulse rounded-full bg-brand-deep [animation-delay:150ms]" />
            <span className="size-2 animate-pulse rounded-full bg-brand-deep [animation-delay:300ms]" />
          </span>
          <span className="font-sans text-sm text-ink-muted">Berpikir…</span>
        </div>
        <div>
          <div
            role="progressbar"
            aria-valuenow={68}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Membuat respons"
            className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-1"
          >
            <div className="h-full w-[68%] rounded-pill bg-brand" />
          </div>
          <div className="mt-1 flex justify-between font-sans text-xs text-ink-muted">
            <span>Membuat respons…</span>
            <span>68%</span>
          </div>
        </div>
      </div>
    </Specimen>
  );
}

export {
  TabsSpecimen,
  PaginationSpecimen,
  DropdownSpecimen,
  ToastSpecimen,
  AlertSpecimen,
  ModalSpecimen,
  ConfirmDialogSpecimen,
  LoadingSpecimen,
};
