import { useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { Plus, Tags, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import {
  CATEGORY_COLORS,
  CATEGORY_COLOR_LABELS,
  CATEGORY_ICON_KEYS,
  CATEGORY_ICON_LABELS,
  CategoryIcon,
} from "@/components/tasks/category-icon";
import { MAX_CATEGORIES } from "@/components/tasks/task-view";
import { IconButton } from "@/components/ui/button";
import { Chip } from "@/components/ui/controls";
import { FormCard, FormHeader, FormScroll } from "@/components/ui/form";
import { ListRow } from "@/components/ui/list";
import {
  EmptyState,
  ErrorState,
  InlineError,
  LoadingState,
} from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";
import {
  categoriesQueryOptions,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
  type Category,
  type CategoryInput,
} from "@/lib/services/api/categories/categories.api";
import { colors, spacing } from "@/lib/theme";

function CategoryEditor({
  category,
  onClose,
}: {
  category: Category | null;
  onClose: () => void;
}) {
  const [values, setValues] = useState<CategoryInput>(() => ({
    name: category?.name ?? "",
    color: category?.color ?? "violet",
    iconKey: category?.iconKey ?? "briefcase",
  }));
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const remove = useDeleteCategory();
  const mutation = category ? update : create;
  const busy = mutation.isPending || remove.isPending;
  const name = values.name.trim();
  const title = category ? "Ubah kategori" : "Kategori baru";

  function save() {
    if (!name || busy) return;
    const input = { ...values, name };
    if (category)
      update.mutate(
        { categoryId: category.id, values: input },
        { onSuccess: onClose }
      );
    else create.mutate(input, { onSuccess: onClose });
  }

  function confirmDelete() {
    if (!category || busy) return;
    Alert.alert(
      "Hapus kategori?",
      `“${category.name}” akan dilepas dari semua tugas yang menggunakannya.`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: () => remove.mutate(category.id, { onSuccess: onClose }),
        },
      ]
    );
  }

  return (
    <>
      <FormHeader
        title={title}
        onCancel={onClose}
        onSave={save}
        canSave={Boolean(name) && !busy}
        saving={mutation.isPending}
      />
      <FormScroll>
        <TextField
          label="Nama kategori"
          placeholder="Contoh: Pekerjaan"
          maxLength={40}
          value={values.name}
          editable={!busy}
          onChangeText={(value) =>
            setValues((current) => ({ ...current, name: value }))
          }
        />
        <View style={styles.field}>
          <Text variant="footnote" weight="medium">
            Warna
          </Text>
          <View style={styles.choices}>
            {CATEGORY_COLORS.map((color) => (
              <Chip
                key={color}
                label={CATEGORY_COLOR_LABELS[color]}
                leading={
                  <CategoryIcon
                    iconKey={values.iconKey}
                    color={color}
                    size={20}
                  />
                }
                selected={values.color === color}
                onPress={
                  busy
                    ? undefined
                    : () => setValues((current) => ({ ...current, color }))
                }
              />
            ))}
          </View>
        </View>
        <View style={styles.field}>
          <Text variant="footnote" weight="medium">
            Ikon
          </Text>
          <View style={styles.choices}>
            {CATEGORY_ICON_KEYS.map((iconKey) => (
              <Chip
                key={iconKey}
                label={CATEGORY_ICON_LABELS[iconKey]}
                leading={
                  <CategoryIcon
                    iconKey={iconKey}
                    color={values.color}
                    size={20}
                  />
                }
                selected={values.iconKey === iconKey}
                onPress={
                  busy
                    ? undefined
                    : () => setValues((current) => ({ ...current, iconKey }))
                }
              />
            ))}
          </View>
        </View>
        <InlineError
          message={mutation.error?.message ?? remove.error?.message}
        />
        {category ? (
          <FormCard>
            <ListRow
              title="Hapus kategori"
              icon={Trash2}
              destructive
              disabled={busy}
              onPress={confirmDelete}
            />
          </FormCard>
        ) : null}
      </FormScroll>
    </>
  );
}

export default function CategoriesScreen() {
  const router = useRouter();
  const query = useQuery(categoriesQueryOptions());
  const [editing, setEditing] = useState<Category | null>();
  const canCreate = Boolean(query.data && query.data.length < MAX_CATEGORIES);

  if (editing !== undefined)
    return (
      <CategoryEditor
        category={editing}
        onClose={() => setEditing(undefined)}
      />
    );

  return (
    <>
      <Stack.Screen
        options={{
          title: "Kategori",
          headerRight: () =>
            canCreate ? (
              <IconButton
                icon={Plus}
                accessibilityLabel="Kategori baru"
                onPress={() => setEditing(null)}
              />
            ) : null,
          headerLeft: () => (
            <Text
              variant="callout"
              tone="accent"
              accessibilityRole="button"
              onPress={() =>
                router.canGoBack() ? router.back() : router.replace("/tasks")
              }
            >
              Selesai
            </Text>
          ),
        }}
      />
      {query.isPending ? <LoadingState label="Memuat kategori…" /> : null}
      {query.isError && !query.data ? (
        <ErrorState
          title="Kategori tidak dapat dimuat"
          message={query.error.message}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.data?.length ? (
        <FormScroll>
          <FormCard>
            {query.data.map((category) => (
              <ListRow
                key={category.id}
                title={category.name}
                subtitle={`${category.taskCount} tugas`}
                leading={
                  <CategoryIcon
                    iconKey={category.iconKey}
                    color={category.color}
                  />
                }
                onPress={() => setEditing(category)}
              />
            ))}
          </FormCard>
          {!canCreate ? (
            <Text tone="muted" variant="footnote">
              Batas {MAX_CATEGORIES} kategori tercapai.
            </Text>
          ) : null}
          <InlineError message={query.error?.message} />
        </FormScroll>
      ) : query.data ? (
        <EmptyState
          icon={<Tags color={colors.mutedForeground} size={28} />}
          title="Belum ada kategori"
          message="Buat kategori untuk mengelompokkan tugas."
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.sm },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
