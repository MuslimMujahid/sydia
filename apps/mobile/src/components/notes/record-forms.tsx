import * as Clipboard from "expo-clipboard";
import * as Crypto from "expo-crypto";
import { useState, type ReactNode } from "react";
import { Modal, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/button";
import { FormScroll, HeaderTextButton } from "@/components/ui/form";
import { ListRow, ListSection } from "@/components/ui/list";
import { InlineError } from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";
import type {
  RecordColumn,
  RecordRow,
} from "@/lib/services/api/record-notes/record-notes.api";
import { colors, spacing } from "@/lib/theme";
import {
  columnTypeLabel,
  recordColumnTypes,
  parseRecordPaste,
  recordDraftValues,
  recordValuesForWrite,
} from "./record-model";

export function RecordForm({
  title,
  onClose,
  onSave,
  canSave,
  saving,
  children,
}: {
  title: string;
  onClose: () => void;
  onSave: () => void;
  canSave: boolean;
  saving: boolean;
  children: ReactNode;
}) {
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={saving ? undefined : onClose}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.modal}>
        <View style={styles.header}>
          <HeaderTextButton label="Batal" onPress={onClose} disabled={saving} />
          <Text variant="headline" accessibilityRole="header">
            {title}
          </Text>
          <HeaderTextButton
            label="Simpan"
            emphasis
            onPress={onSave}
            loading={saving}
            disabled={!canSave}
          />
        </View>
        <FormScroll>{children}</FormScroll>
      </SafeAreaView>
    </Modal>
  );
}

type RowValues = Record<string, string | boolean | null>;

export function RecordRowForm({
  row,
  columns,
  onClose,
  onSubmit,
}: {
  row: RecordRow | null;
  columns: RecordColumn[];
  onClose: () => void;
  onSubmit: (values: RowValues) => Promise<void>;
}) {
  const [initial] = useState(() => recordDraftValues(row, columns));
  const [values, setValues] = useState(initial);
  const changes = recordValuesForWrite(values, row ? initial : undefined);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(undefined);
    try {
      await onSubmit(changes);
    } catch (caught) {
      console.warn("Record row edit retained after failure", {
        name: caught instanceof Error ? caught.name : "UnknownError",
      });
      setError(
        caught instanceof Error ? caught.message : "Baris belum dapat disimpan."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <RecordForm
      title={row ? "Ubah baris" : "Baris baru"}
      onClose={onClose}
      onSave={() => void save()}
      canSave={columns.length > 0 && (!row || Object.keys(changes).length > 0)}
      saving={saving}
    >
      {columns.map((column) => (
        <RecordCellField
          key={column.id}
          column={column}
          value={values[column.id] ?? null}
          onChange={(value) =>
            setValues((current) => ({ ...current, [column.id]: value }))
          }
          disabled={saving}
        />
      ))}
      <InlineError message={error} />
    </RecordForm>
  );
}

function RecordCellField({
  column,
  value,
  onChange,
  disabled,
}: {
  column: RecordColumn;
  value: string | boolean | null;
  onChange: (value: string | boolean | null) => void;
  disabled: boolean;
}) {
  // Use in-modal controls so both iOS and Android can select values.
  const options =
    column.type === "boolean"
      ? [
          { value: true, label: "Ya" },
          { value: false, label: "Tidak" },
        ]
      : column.type === "choice"
        ? (column.options ?? []).map((option) => ({
            value: option,
            label: option,
          }))
        : null;

  if (options) {
    const selected = options.find((option) => option.value === value);
    return (
      <ChoiceField
        label={column.name}
        current={
          selected?.label ?? (typeof value === "string" ? value : "Kosong")
        }
        options={[{ value: null, label: "Kosong" }, ...options]}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  const placeholder =
    column.type === "date"
      ? "YYYY-MM-DD"
      : column.type === "datetime"
        ? "YYYY-MM-DD HH:mm"
        : undefined;
  return (
    <TextField
      label={column.name}
      value={typeof value === "string" ? value : ""}
      placeholder={placeholder}
      hint={column.unit}
      onChangeText={onChange}
      editable={!disabled}
      maxLength={10000}
      keyboardType={
        column.type === "number" ? "numbers-and-punctuation" : "default"
      }
    />
  );
}

function ChoiceField<T extends boolean | string | null>({
  label,
  current,
  options,
  onChange,
  disabled,
}: {
  label: string;
  current: string;
  options: { label: string; value: T }[];
  onChange: (value: T) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <ListSection title={label}>
      <ListRow
        title={current}
        accessibilityLabel={`${label}, ${current}`}
        disabled={disabled}
        onPress={() => setOpen(!open)}
      />
      {open
        ? options.map((option) => (
            <ListRow
              key={String(option.value)}
              title={option.label}
              disabled={disabled}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
            />
          ))
        : null}
    </ListSection>
  );
}

export function RecordColumnForm({
  column,
  onClose,
  onSubmit,
}: {
  column: RecordColumn | null;
  onClose: () => void;
  onSubmit: (column: RecordColumn) => Promise<void>;
}) {
  const [id] = useState(() => column?.id ?? Crypto.randomUUID());
  const [name, setName] = useState(column?.name ?? "");
  const [type, setType] = useState<RecordColumn["type"]>(
    column?.type ?? "text"
  );
  const [unit, setUnit] = useState(column?.unit ?? "");
  const [optionsText, setOptionsText] = useState(
    column?.options?.join("\n") ?? ""
  );
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const choices = optionsText
    .split("\n")
    .map((option) => option.trim())
    .filter(Boolean);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(undefined);
    try {
      await onSubmit({
        id,
        name: name.trim(),
        type,
        required: false,
        ...(type === "number" && unit.trim() ? { unit: unit.trim() } : {}),
        ...(type === "choice" ? { options: choices } : {}),
      });
    } catch (caught) {
      console.warn("Record column edit retained after failure", {
        name: caught instanceof Error ? caught.name : "UnknownError",
      });
      setError(
        caught instanceof Error ? caught.message : "Kolom belum dapat disimpan."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <RecordForm
      title={column ? "Ubah kolom" : "Kolom baru"}
      onClose={onClose}
      onSave={() => void save()}
      canSave={!!name.trim() && (type !== "choice" || choices.length > 0)}
      saving={saving}
    >
      <TextField
        label="Nama kolom"
        value={name}
        onChangeText={setName}
        maxLength={160}
        editable={!saving}
      />
      <ChoiceField
        label="Tipe"
        current={columnTypeLabel(type)}
        disabled={saving}
        options={recordColumnTypes.map((entry) => ({
          label: entry.label,
          value: entry.type,
        }))}
        onChange={setType}
      />
      {type === "number" ? (
        <TextField
          label="Satuan"
          value={unit}
          onChangeText={setUnit}
          maxLength={40}
          editable={!saving}
        />
      ) : null}
      {type === "choice" ? (
        <TextField
          label="Pilihan"
          hint="Masukkan satu pilihan per baris."
          value={optionsText}
          onChangeText={setOptionsText}
          multiline
          editable={!saving}
        />
      ) : null}
      <InlineError message={error} />
    </RecordForm>
  );
}

export function RecordContextForm({
  initial,
  onClose,
  onSubmit,
}: {
  initial: string;
  onClose: () => void;
  onSubmit: (description: string) => Promise<void>;
}) {
  const [description, setDescription] = useState(initial);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await onSubmit(description);
    } catch (caught) {
      console.warn("Record description edit retained after failure", {
        name: caught instanceof Error ? caught.name : "UnknownError",
      });
      setError(
        caught instanceof Error
          ? caught.message
          : "Deskripsi belum dapat disimpan."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <RecordForm
      title="Deskripsi tabel"
      onClose={onClose}
      onSave={() => void save()}
      canSave={initial !== description}
      saving={saving}
    >
      <TextField
        label="Deskripsi"
        value={description}
        onChangeText={setDescription}
        maxLength={4000}
        multiline
        editable={!saving}
      />
      <InlineError message={error} />
    </RecordForm>
  );
}

export function RecordPasteForm({
  columns,
  onClose,
  onSubmit,
}: {
  columns: RecordColumn[];
  onClose: () => void;
  onSubmit: (rows: { values: Record<string, string> }[]) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  async function paste() {
    setError(undefined);
    try {
      const value = await Clipboard.getStringAsync();
      if (!value.trim()) throw new Error("Papan klip kosong.");
      setText(value);
    } catch (caught) {
      console.warn("Could not read record clipboard", {
        name: caught instanceof Error ? caught.name : "UnknownError",
      });
      setError(
        caught instanceof Error
          ? caught.message
          : "Papan klip belum dapat dibaca."
      );
    }
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(undefined);
    try {
      await onSubmit(parseRecordPaste(text, columns));
    } catch (caught) {
      console.warn("Record paste was not saved", {
        name: caught instanceof Error ? caught.name : "UnknownError",
      });
      setError(
        caught instanceof Error ? caught.message : "Data belum dapat ditempel."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <RecordForm
      title="Tempel baris"
      onClose={onClose}
      onSave={() => void save()}
      canSave={!!text.trim()}
      saving={saving}
    >
      <Text tone="muted">
        Data spreadsheet akan ditambahkan sesuai urutan kolom.
      </Text>
      <TextField
        label="Data tabel"
        value={text}
        onChangeText={setText}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        editable={!saving}
      />
      <Button
        label="Ambil dari papan klip"
        variant="outline"
        onPress={() => void paste()}
        disabled={saving}
      />
      <InlineError message={error} />
    </RecordForm>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
  },
});
