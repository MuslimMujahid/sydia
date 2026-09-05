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
      title="Button"
      description="Actions that move ideas forward."
    >
      <div className="space-y-3">
        <Button variant="primary" className="w-full">
          <Sparkles />
          Ask Sydia
        </Button>
        <Button variant="dark" className="w-full">
          Create
        </Button>
        <Button variant="secondary" className="w-full">
          Learn more
        </Button>
        <Button variant="primary" disabled className="w-full">
          Disabled
        </Button>
      </div>
    </Specimen>
  );
}

function TextInputSpecimen() {
  return (
    <Specimen
      number="02"
      title="Text Input"
      description="Simple, clear input fields."
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="input-default"
            className="font-sans text-sm text-ink-soft"
          >
            Default
          </label>
          <Input id="input-default" placeholder="Enter your message…" />
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="input-focused"
            className="font-sans text-sm text-ink-soft"
          >
            Focused
          </label>
          <Input
            id="input-focused"
            defaultValue="Plan my next project"
            className="border-brand ring-3 ring-brand/30"
            readOnly
          />
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="input-icon"
            className="font-sans text-sm text-ink-soft"
          >
            With icon
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-weak" />
            <Input
              id="input-icon"
              placeholder="Search anything…"
              className="pl-9"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="input-error"
            className="font-sans text-sm text-ink-soft"
          >
            Error
          </label>
          <Input
            id="input-error"
            defaultValue="Please enter a value"
            aria-invalid
            aria-describedby="input-error-message"
          />
          <p
            id="input-error-message"
            role="alert"
            className="flex items-center gap-1 font-sans text-xs text-destructive"
          >
            <CircleAlert className="size-3.5" />
            This field is required.
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
      title="Textarea"
      description="For longer, richer input."
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="textarea-default"
            className="font-sans text-sm text-ink-soft"
          >
            Default
          </label>
          <Textarea
            id="textarea-default"
            placeholder="Share more details…"
            rows={3}
          />
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="textarea-focused"
            className="font-sans text-sm text-ink-soft"
          >
            Focused
          </label>
          <Textarea
            id="textarea-focused"
            defaultValue="Outline my goals for next quarter…"
            rows={3}
            readOnly
            aria-describedby="textarea-count"
            className="border-brand ring-3 ring-brand/30"
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
  "Sydia (Default)",
  "Sydia Pro",
  "Sydia Vision",
  "Sydia Research",
];

function SelectSpecimen() {
  return (
    <Specimen
      number="04"
      title="Select"
      description="Pick from a list of options."
    >
      <div className="space-y-2">
        <button
          type="button"
          aria-haspopup="listbox"
          className="flex h-[38px] w-full items-center justify-between rounded-sm border border-hairline bg-canvas px-3 font-sans text-base text-ink-muted"
        >
          Choose a model
          <ChevronDown className="size-4 text-ink-weak" />
        </button>
        <div
          role="listbox"
          aria-label="Models"
          className="space-y-0.5 rounded-md border border-surface-1 bg-canvas p-1.5 shadow-sm"
        >
          {MODELS.map((model, index) => (
            <div
              key={model}
              role="option"
              aria-selected={index === 0}
              className={`flex items-center justify-between rounded-sm px-2.5 py-2 font-sans text-sm ${
                index === 0 ? "bg-surface-1 text-ink" : "text-ink-soft"
              }`}
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
    <Specimen number="05" title="Checkbox" description="Multi-select options.">
      <div className="space-y-3">
        <label className="flex items-center gap-3 font-sans text-base text-ink">
          <Checkbox name="remember" /> Remember this device
        </label>
        <label className="flex items-center gap-3 font-sans text-base text-ink">
          <Checkbox name="updates" defaultChecked /> Send me updates
        </label>
        <label className="flex items-center gap-3 font-sans text-base text-ink">
          <Checkbox name="beta" /> Enable beta features
        </label>
        <label className="flex items-center gap-3 font-sans text-base text-ink-weak">
          <Checkbox name="disabled" defaultChecked disabled /> Disabled option
        </label>
      </div>
    </Specimen>
  );
}

function RadioSpecimen() {
  return (
    <Specimen number="06" title="Radio" description="Single-select options.">
      <RadioGroup
        defaultValue="default"
        aria-label="Choose a model"
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
          <Radio value="disabled" disabled /> Disabled option
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
    label: "Enable personal memory",
    description: "Helps Sydia remember what matters.",
    defaultChecked: true,
  },
  { label: "Offline mode", description: "Process locally on this device." },
  {
    label: "Usage analytics",
    description: "Help improve Sydia for everyone.",
    defaultChecked: true,
  },
];

function SwitchSpecimen() {
  return (
    <Specimen number="07" title="Switch" description="Toggle a single setting.">
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

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function DatePickerSpecimen() {
  return (
    <Specimen
      number="08"
      title="Date Picker"
      description="Select dates and schedule."
    >
      <div className="space-y-2">
        <button
          type="button"
          className="flex h-[38px] w-full items-center gap-2 rounded-sm border border-hairline bg-canvas px-3 font-sans text-base text-ink"
        >
          <Calendar className="size-4 text-ink-weak" />
          Apr 24, 2025
        </button>
        <div
          className="rounded-md border border-surface-1 bg-canvas p-3"
          role="group"
          aria-label="April 2025 calendar"
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
                  className={`rounded-full py-1 ${
                    day === 24
                      ? "bg-brand font-semibold text-ink"
                      : "text-ink-soft hover:bg-surface-1"
                  }`}
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
      title="File Upload"
      description="Drag, drop, or browse files."
    >
      <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-hairline bg-surface-1/40 px-4 py-8 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-canvas">
          <Upload className="size-4 text-ink-soft" />
        </span>
        <p className="font-sans text-base font-medium text-ink">
          Upload source files
        </p>
        <p className="font-sans text-sm leading-[21px] text-ink-muted">
          Drag and drop files here, or click to browse
        </p>
      </div>
      <p className="font-sans text-xs text-ink-weak">
        Supports PDF, doc, txt, md, csv (max 10MB)
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
