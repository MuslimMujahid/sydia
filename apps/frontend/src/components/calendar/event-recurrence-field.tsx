import { useEffect, useState } from "react";
import { SelectField, TextField } from "@/components/forms/form-fields";
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
      <label className="block space-y-1 text-sm">
        <span className="sr-only">Pengulangan</span>
        <SelectField
          value={editingCustom ? "custom" : preset}
          onChange={(event) => {
            const next = event.target.value as RepeatPreset;
            setEditingCustom(next === "custom");
            if (next !== "custom") onChange(presetRecurrence(next));
            else if (preset !== "custom") update(custom);
          }}
        >
          {Object.entries(REPEAT_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </SelectField>
      </label>
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
              value={custom.frequency}
              onChange={(event) =>
                update({
                  ...custom,
                  frequency: event.target.value as RepeatFrequency,
                })
              }
            >
              <option value="DAILY">hari</option>
              <option value="WEEKLY">minggu</option>
              <option value="MONTHLY">bulan</option>
              <option value="YEARLY">tahun</option>
            </SelectField>
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
          <label className="block space-y-1 text-sm">
            Berakhir
            <SelectField
              value={custom.end}
              onChange={(event) =>
                update({
                  ...custom,
                  end: event.target.value as CustomRepeat["end"],
                })
              }
            >
              <option value="never">Tidak pernah</option>
              <option value="date">Pada tanggal</option>
              <option value="count">Setelah beberapa kali</option>
            </SelectField>
          </label>
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
