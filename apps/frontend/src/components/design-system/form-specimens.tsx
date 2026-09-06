import {
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Search,
  Sparkles,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Specimen } from "./section";

function ButtonSpecimen() {
  return (
    <Specimen
      number="01"
      title="Tombol"
      description="Aksi untuk mendorong ide maju."
    >
      <div className="space-y-3">
        <Button variant="primary" className="w-full">
          <Sparkles />
          Tanya Sydia
        </Button>
        <Button variant="dark" className="w-full">
          Ciptakan
        </Button>
        <Button variant="dark-outline" className="w-full">
          Pelajari lebih lanjut
        </Button>
        <Button variant="primary" disabled className="w-full">
          Dinonaktifkan
        </Button>
      </div>
    </Specimen>
  );
}

function TextInputSpecimen() {
  return (
    <Specimen
      number="02"
      title="Input Teks"
      description="Kolom input sederhana dan jelas."
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="input-default"
            className="font-sans text-sm text-ink-soft"
          >
            Bawaan
          </label>
          <Input id="input-default" placeholder="Masukkan pesan Anda…" />
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="input-focused"
            className="font-sans text-sm text-ink-soft"
          >
            Terfokus
          </label>
          <Input
            id="input-focused"
            defaultValue="Rencanakan proyek berikutnya"
            className="border-brand ring-4 ring-brand/15"
            readOnly
          />
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="input-icon"
            className="font-sans text-sm text-ink-soft"
          >
            Dengan ikon
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-weak" />
            <Input
              id="input-icon"
              placeholder="Cari apa saja…"
              className="pl-9"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="input-error"
            className="font-sans text-sm text-ink-soft"
          >
            Kesalahan
          </label>
          <Input
            id="input-error"
            defaultValue="Masukkan nilai"
            aria-invalid
            aria-describedby="input-error-message"
          />
          <p
            id="input-error-message"
            role="alert"
            className="flex items-center gap-1 font-sans text-xs text-destructive"
          >
            <CircleAlert className="size-3.5" />
            Kolom ini wajib diisi.
          </p>
        </div>
      </div>
    </Specimen>
  );
}

function TextareaSpecimen() {
  return (
    <Specimen
      number="03"
      title="Area Teks"
      description="Untuk input yang lebih panjang dan kaya."
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="textarea-default"
            className="font-sans text-sm text-ink-soft"
          >
            Bawaan
          </label>
          <Textarea
            id="textarea-default"
            placeholder="Bagikan detail selengkapnya…"
            rows={3}
          />
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="textarea-focused"
            className="font-sans text-sm text-ink-soft"
          >
            Terfokus
          </label>
          <Textarea
            id="textarea-focused"
            defaultValue="Uraikan tujuan Anda untuk kuartal berikutnya…"
            rows={3}
            readOnly
            aria-describedby="textarea-count"
            className="border-brand ring-4 ring-brand/15"
          />
          <p
            id="textarea-count"
            className="text-right font-sans text-xs text-ink-weak"
          >
            32 / 500
          </p>
        </div>
      </div>
    </Specimen>
  );
}

const MODELS = [
  "Sydia (Bawaan)",
  "Sydia Pro",
  "Sydia Vision",
  "Sydia Research",
];

function SelectSpecimen() {
  return (
    <Specimen number="04" title="Pilihan" description="Pilih dari daftar opsi.">
      <div className="space-y-2">
        <button
          type="button"
          aria-haspopup="listbox"
          className="flex h-[38px] w-full items-center justify-between rounded-sm border border-hairline bg-canvas px-3 font-sans text-base text-ink-muted"
        >
          Pilih model
          <ChevronDown className="size-4 text-ink-weak" />
        </button>
        <div
          role="listbox"
          aria-label="Model"
          className="space-y-0.5 rounded-md border border-ink/6 bg-canvas p-1.5 shadow-card"
        >
          {MODELS.map((model, index) => (
            <div
              key={model}
              role="option"
              aria-selected={index === 0}
              className={`flex items-center justify-between rounded-sm px-2.5 py-2 font-sans text-sm ${index === 0 ? "bg-surface-1 text-ink" : "text-ink-soft"}`}
            >
              {model}
              {index === 0 ? (
                <Check className="size-4 text-brand-deep" />
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </Specimen>
  );
}

function CheckboxSpecimen() {
  return (
    <Specimen
      number="05"
      title="Kotak Centang"
      description="Opsi multi-pilihan."
    >
      <div className="space-y-3">
        <label className="flex items-center gap-3 font-sans text-base text-ink">
          <Checkbox name="remember" /> Ingat perangkat ini
        </label>
        <label className="flex items-center gap-3 font-sans text-base text-ink">
          <Checkbox name="updates" defaultChecked /> Kirim pembaruan
        </label>
        <label className="flex items-center gap-3 font-sans text-base text-ink">
          <Checkbox name="beta" /> Aktifkan fitur beta
        </label>
        <label className="flex items-center gap-3 font-sans text-base text-ink-weak">
          <Checkbox name="disabled" defaultChecked disabled /> Opsi
          dinonaktifkan
        </label>
      </div>
    </Specimen>
  );
}

function RadioSpecimen() {
  return (
    <Specimen number="06" title="Radio" description="Opsi pilihan tunggal.">
      <RadioGroup
        defaultValue="default"
        aria-label="Pilih model"
        className="space-y-3"
      >
        {MODELS.map((model) => (
          <label
            key={model}
            className="flex items-center gap-3 font-sans text-base text-ink"
          >
            <Radio value={model} /> {model}
          </label>
        ))}
        <label className="flex items-center gap-3 font-sans text-base text-ink-weak">
          <Radio value="disabled" disabled /> Opsi dinonaktifkan
        </label>
      </RadioGroup>
    </Specimen>
  );
}

const SWITCHES: {
  label: string;
  description: string;
  defaultChecked?: boolean;
}[] = [
  {
    label: "Aktifkan memori pribadi",
    description: "Membantu Sydia mengingat hal penting.",
    defaultChecked: true,
  },
  {
    label: "Mode offline",
    description: "Memproses secara lokal di perangkat ini.",
  },
  {
    label: "Analitik penggunaan",
    description: "Bantu meningkatkan Sydia untuk semua orang.",
    defaultChecked: true,
  },
];

function SwitchSpecimen() {
  return (
    <Specimen
      number="07"
      title="Sakelar"
      description="Alihkan satu pengaturan."
    >
      <div className="space-y-5">
        {SWITCHES.map((item) => (
          <label key={item.label} className="flex items-start gap-3">
            <Switch defaultChecked={item.defaultChecked} className="mt-0.5" />
            <span>
              <span className="block font-sans text-base leading-6 text-ink">
                {item.label}
              </span>
              <span className="block font-sans text-sm leading-[21px] text-ink-muted">
                {item.description}
              </span>
            </span>
          </label>
        ))}
      </div>
    </Specimen>
  );
}

const CALENDAR_WEEKS: (number | null)[][] = [
  [null, null, 1, 2, 3, 4, 5],
  [6, 7, 8, 9, 10, 11, 12],
  [13, 14, 15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24, 25, 26],
  [27, 28, 29, 30, null, null, null],
];

const WEEKDAYS = ["Mg", "Sn", "Sl", "Rb", "Km", "Jm", "Sb"];

function DatePickerSpecimen() {
  return (
    <Specimen
      number="08"
      title="Pemilih Tanggal"
      description="Pilih tanggal dan jadwalkan."
    >
      <div className="space-y-2">
        <button
          type="button"
          className="flex h-[38px] w-full items-center gap-2 rounded-sm border border-hairline bg-canvas px-3 font-sans text-base text-ink"
        >
          <Calendar className="size-4 text-ink-weak" />
          24 Apr 2025
        </button>
        <div
          className="rounded-md border border-surface-1 bg-canvas p-3"
          role="group"
          aria-label="Kalender April 2025"
        >
          <div className="mb-2 flex items-center justify-between">
            <ChevronLeft className="size-4 text-ink-weak" aria-hidden="true" />
            <p className="font-display text-sm font-semibold text-ink">
              April 2025
            </p>
            <ChevronRight className="size-4 text-ink-weak" aria-hidden="true" />
          </div>
          <div className="grid grid-cols-7 gap-1 text-center font-sans text-xs">
            {WEEKDAYS.map((day) => (
              <span key={day} className="py-1 font-medium text-ink-weak">
                {day}
              </span>
            ))}
            {CALENDAR_WEEKS.flat().map((day, index) =>
              day === null ? (
                <span key={`empty-${index}`} />
              ) : (
                <span
                  key={day}
                  aria-current={day === 24 ? "date" : undefined}
                  className={`rounded-full py-1 ${day === 24 ? "bg-brand font-semibold text-ink" : "text-ink-soft hover:bg-surface-1"}`}
                >
                  {day}
                </span>
              )
            )}
          </div>
        </div>
      </div>
    </Specimen>
  );
}

function FileUploadSpecimen() {
  return (
    <Specimen
      number="09"
      title="Unggah Berkas"
      description="Seret, jatuhkan, atau telusuri berkas."
    >
      <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-hairline bg-surface-1/40 px-4 py-8 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-canvas">
          <Upload className="size-4 text-ink-soft" />
        </span>
        <p className="font-sans text-base font-medium text-ink">
          Unggah berkas sumber
        </p>
        <p className="font-sans text-sm leading-[21px] text-ink-muted">
          Seret dan jatuhkan berkas di sini, atau klik untuk menelusuri
        </p>
      </div>
      <p className="font-sans text-xs text-ink-weak">
        Mendukung PDF, doc, txt, md, csv (maks. 10MB)
      </p>
    </Specimen>
  );
}

export {
  ButtonSpecimen,
  TextInputSpecimen,
  TextareaSpecimen,
  SelectSpecimen,
  CheckboxSpecimen,
  RadioSpecimen,
  SwitchSpecimen,
  DatePickerSpecimen,
  FileUploadSpecimen,
};
