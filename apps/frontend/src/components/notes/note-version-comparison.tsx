import { ArrowLeft } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

interface NoteVersionComparisonProps {
  draftTitle: string;
  draftText: string;
  savedTitle?: string;
  savedText?: string;
  source?: string;
  updatedAt?: string | null;
  timezone?: string;
  resolving: boolean;
  error: string | null;
  onChoose: (choice: "server" | "draft") => void;
  onBack: () => void;
}

/** A comparison belongs inside the note panel so desktop chat stays usable. */
export function NoteVersionComparison({
  draftTitle,
  draftText,
  savedTitle,
  savedText,
  source,
  updatedAt,
  timezone,
  resolving,
  error,
  onChoose,
  onBack,
}: NoteVersionComparisonProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const sourceLabel =
    source === "chat"
      ? "Dari asisten"
      : source === "dashboard"
        ? "Diedit manual"
        : source === "whatsapp"
          ? "WhatsApp"
          : source === "telegram"
            ? "Telegram"
            : "Versi tersimpan";

  return (
    <section
      aria-labelledby="note-comparison-title"
      className="px-6 pt-10 pb-10 sm:pt-8"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !resolving) {
          event.preventDefault();
          event.stopPropagation();
          onBack();
        }
      }}
    >
      <h2
        ref={heading}
        tabIndex={-1}
        id="note-comparison-title"
        className="font-display text-[28px] leading-tight font-bold tracking-[-0.03em] outline-none"
      >
        Bandingkan versi
      </h2>
      <p className="mt-3 hidden text-sm leading-[1.6] text-ink-muted sm:block">
        Pilih versi yang ingin disimpan.
        <br />
        Tidak ada perubahan yang digabung otomatis.
      </p>
      <p className="mt-2 text-sm text-ink-muted sm:hidden">
        Draf Anda aman. Pilih versi yang disimpan.
      </p>
      <div className="mt-6 grid gap-6 sm:mt-10 sm:gap-4 sm:grid-cols-2">
        <section className="min-w-0">
          <h3 className="text-sm font-semibold">
            Draf Anda<span className="sm:hidden"> · Belum tersimpan</span>
          </h3>
          <p className="mt-2 hidden text-xs text-ink-muted sm:block">
            Belum tersimpan
          </p>
          <div className="mt-4 h-[140px] overflow-y-auto rounded-[10px] bg-background p-4 text-sm leading-[1.6] sm:mt-5 sm:h-[330px]">
            <p>{draftTitle}</p>
            <p className="mt-6 whitespace-pre-wrap break-words">{draftText}</p>
          </div>
        </section>
        <section className="min-w-0">
          <h3 className="text-sm font-semibold">
            Tersimpan terbaru<span className="sm:hidden"> · {sourceLabel}</span>
          </h3>
          <p className="mt-2 hidden text-xs text-ink-muted sm:block">
            {sourceLabel}
            {updatedAt
              ? ` · ${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(new Date(updatedAt))}`
              : ""}
          </p>
          <div className="mt-4 h-[140px] overflow-y-auto rounded-[10px] bg-background p-4 text-sm leading-[1.6] sm:mt-5 sm:h-[330px]">
            {savedTitle ? (
              <>
                <p>{savedTitle}</p>
                <p className="mt-6 whitespace-pre-wrap break-words">
                  {savedText}
                </p>
              </>
            ) : (
              <p>Versi terbaru belum dimuat. Coba lagi.</p>
            )}
          </div>
        </section>
      </div>
      <p className="mt-8 max-w-[360px] text-xs leading-[1.6] text-ink-muted">
        <span className="sm:hidden">
          Draf yang dipilih mengganti versi tersimpan.
        </span>
        <span className="hidden sm:inline">
          Menyimpan draf Anda akan mengganti versi yang sedang dibandingkan.
        </span>
      </p>
      {error ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-8 flex flex-col gap-3 [&>button]:h-11 [&>button]:rounded-[10px] [&>button]:text-left [&>button]:justify-start">
        <Button
          variant="dark-outline"
          disabled={resolving}
          onClick={() => onChoose("server")}
        >
          Gunakan versi tersimpan
        </Button>
        <Button
          variant="secondary"
          className="shadow-none"
          disabled={resolving || !savedTitle}
          onClick={() => onChoose("draft")}
        >
          {resolving ? "Menyimpan…" : "Simpan draf saya"}
        </Button>
        <Button
          variant="ghost"
          className="mt-2 self-start"
          disabled={resolving}
          onClick={onBack}
        >
          <ArrowLeft />
          Kembali ke draf
        </Button>
      </div>
    </section>
  );
}
