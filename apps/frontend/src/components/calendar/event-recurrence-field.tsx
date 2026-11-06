import { useEffect, useState } from "react";
import {
  SelectField,
  TextField,
  type SelectOption,
} from "@/components/forms/form-fields";
import {
  REPEAT_DAYS,
  REPEAT_LABELS,
  customRecurrence,
  initialCustomRepeat,
  presetRecurrence,
  recurrencePreset,
  type CustomRepeat,
  type RepeatFrequency,
  type RepeatPreset,
} from "./event-recurrence";

const REPEAT_FREQUENCY_OPTIONS: SelectOption<RepeatFrequency>[] = [
  { value: "DAILY", label: "hari" },
  { value: "WEEKLY", label: "minggu" },
  { value: "MONTHLY", label: "bulan" },
  { value: "YEARLY", label: "tahun" },
];

const REPEAT_END_OPTIONS: SelectOption<CustomRepeat["end"]>[] = [
  { value: "never", label: "Tidak pernah" },
  { value: "date", label: "Pada tanggal" },
  { value: "count", label: "Setelah beberapa kali" },
];

type EventRecurrenceFieldProps = {
  value: string[];
  startDate: string;
  allDay: boolean;
  timezone: string;
  disabled?: boolean;
  onChange: (value: string[]) => void;
  onValidityChange: (valid: boolean) => void;
};

export function EventRecurrenceField({
  value,
  startDate,
  allDay,
  timezone,
  disabled,
  onChange,
  onValidityChange,
}: EventRecurrenceFieldProps) {
  const [custom, setCustom] = useState(() =>
    initialCustomRepeat(value, startDate, timezone)
  );

  const [editingCustom, setEditingCustom] = useState(false);
  const preset = recurrencePreset(value);
  const valid =
    !editingCustom ||
    custom.end !== "date" ||
    (Boolean(custom.until) && custom.until >= startDate);

  useEffect(() => onValidityChange(valid), [valid, onValidityChange]);

  useEffect(() => {
    if (!editingCustom) return;
    const next = customRecurrence(custom, allDay, timezone);
    if (JSON.stringify(next) !== JSON.stringify(value)) onChange(next);
  }, [editingCustom, custom, allDay, timezone, value, onChange]);

  function update(next: CustomRepeat) {
    setCustom(next);
    onChange(customRecurrence(next, allDay, timezone));
  }

  return (
    <fieldset disabled={disabled} className="space-y-3">
      <SelectField
        aria-label="Pengulangan"
        value={editingCustom ? "custom" : preset}
        onValueChange={(next) => {
          setEditingCustom(next === "custom");
          if (next !== "custom") onChange(presetRecurrence(next));
          else if (preset !== "custom") update(custom);
        }}
        options={(
          Object.entries(REPEAT_LABELS) as [RepeatPreset, string][]
        ).map(([value, label]) => ({ value, label }))}
      />
      {preset === "custom" && !editingCustom ? (
        <button
          type="button"
          className="text-sm text-ink underline underline-offset-4"
          onClick={() => setEditingCustom(true)}
        >
          Ubah pengulangan kustom
        </button>
      ) : null}
      {!valid ? (
        <p role="alert" className="text-xs text-destructive">
          Pilih tanggal akhir pada atau setelah tanggal mulai.
        </p>
      ) : null}
      {editingCustom ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              Setiap
              <TextField
                aria-label="Interval pengulangan"
                className="w-16"
                type="number"
                min={1}
                max={99}
                value={custom.interval}
                onChange={(event) => {
                  const interval = Number(event.target.value);
                  if (
                    Number.isInteger(interval) &&
                    interval >= 1 &&
                    interval <= 99
                  )
                    update({ ...custom, interval });
                }}
              />
            </label>
            <SelectField
              aria-label="Satuan pengulangan"
              className="w-auto"
              value={custom.frequency}
              onValueChange={(frequency) => update({ ...custom, frequency })}
              options={REPEAT_FREQUENCY_OPTIONS}
            />
          </div>
          {custom.frequency === "WEEKLY" ? (
            <fieldset>
              <legend className="mb-2 text-xs text-ink-muted">
                Ulangi pada
              </legend>
              <div className="flex flex-wrap gap-1">
                {REPEAT_DAYS.map((day, index) => (
                  <label
                    key={day}
                    className="flex items-center gap-1 rounded-sm bg-surface-1 px-2 py-1.5 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={custom.days.includes(day)}
                      aria-label={
                        [
                          "Senin",
                          "Selasa",
                          "Rabu",
                          "Kamis",
                          "Jumat",
                          "Sabtu",
                          "Minggu",
                        ][index]
                      }
                      onChange={(event) =>
                        update({
                          ...custom,
                          days: event.target.checked
                            ? REPEAT_DAYS.filter(
                                (item) =>
                                  item === day || custom.days.includes(item)
                              )
                            : custom.days.filter((item) => item !== day),
                        })
                      }
                    />
                    {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"][index]}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <div className="space-y-1 text-sm">
            <span id="repeat-end-label">Berakhir</span>
            <SelectField
              aria-labelledby="repeat-end-label"
              value={custom.end}
              onValueChange={(end) => update({ ...custom, end })}
              options={REPEAT_END_OPTIONS}
            />
          </div>
          {custom.end === "date" ? (
            <TextField
              aria-label="Tanggal akhir pengulangan"
              type="date"
              min={startDate}
              value={custom.until}
              onChange={(event) =>
                update({ ...custom, until: event.target.value })
              }
            />
          ) : null}
          {custom.end === "count" ? (
            <label className="flex items-center gap-2 text-sm">
              <TextField
                aria-label="Jumlah pengulangan"
                className="w-24"
                type="number"
                min={1}
                max={999}
                value={custom.count}
                onChange={(event) => {
                  const count = Number(event.target.value);
                  if (Number.isInteger(count) && count >= 1 && count <= 999)
                    update({ ...custom, count });
                }}
              />
              kali
            </label>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}
