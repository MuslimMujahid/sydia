import { useRouter, type Href } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  AlarmClock,
  CalendarDays,
  FileText,
  Files,
  SquareCheck,
  type LucideIcon,
} from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import type { SupportedLocale } from "@/lib/services/api/users/users.api";
import { entityColors, radius, spacing } from "@/lib/theme";
import type { ChatEntity } from "./chat-entities";

/** Icons and names per entity kind, matching the web's entity-pill-styles. */
export const ENTITY_PILL_STYLES: Record<
  ChatEntity["kind"],
  { icon: LucideIcon; en: string; id: string }
> = {
  note: { icon: Files, en: "Note", id: "Catatan" },
  task: { icon: SquareCheck, en: "Task", id: "Tugas" },
  reminder: { icon: AlarmClock, en: "Reminder", id: "Pengingat" },
  file: { icon: FileText, en: "File", id: "File" },
  event: { icon: CalendarDays, en: "Event", id: "Acara" },
};

/** The screen that shows an entity; shared by every pill and agenda row. */
export function entityHref(entity: ChatEntity): Href {
  switch (entity.kind) {
    case "task":
      return { pathname: "/task/[id]", params: { id: entity.id } };
    case "reminder":
      return { pathname: "/reminder/[id]", params: { id: entity.id } };
    case "event":
      return { pathname: "/event/[id]", params: { id: entity.id } };
    case "file":
      return { pathname: "/document/[id]", params: { id: entity.id } };
    case "note":
      return { pathname: "/note/[ref]", params: { ref: entity.ref } };
  }
}

/** A daily note reads as its date ("19 November 2026"), not its key. */
export function entityDisplayLabel(
  entity: ChatEntity,
  label: string,
  locale: SupportedLocale
): string {
  if (entity.kind === "note" && entity.ref.startsWith("daily:"))
    return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${entity.ref.slice(6)}T12:00:00Z`));

  return label;
}

export function EntityGlyph({
  entity,
  size,
  color,
  strokeWidth,
}: {
  entity: ChatEntity;
  size: number;
  color: string;
  strokeWidth: number;
}) {
  const { icon: Icon } = ENTITY_PILL_STYLES[entity.kind];
  const props = { size, color, strokeWidth };

  return entity.kind === "note" && entity.ref.startsWith("daily:") ? (
    <CalendarDays {...props} />
  ) : (
    <Icon {...props} />
  );
}

export function useOpenEntity() {
  const router = useRouter();

  return (entity: ChatEntity) => {
    void Haptics.selectionAsync();
    router.push(entityHref(entity));
  };
}

interface EntityPillProps {
  entity: ChatEntity;
  label?: string;
  locale: SupportedLocale;
}

/** A standalone pill (attachments, sources). Inline pills live in Markdown. */
export function EntityPill({
  entity,
  label = entity.title,
  locale,
}: EntityPillProps) {
  const open = useOpenEntity();
  const tint = entityColors[entity.kind];
  const text = entityDisplayLabel(entity, label, locale);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${ENTITY_PILL_STYLES[entity.kind][locale]}: ${text}`}
      onPress={() => open(entity)}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: tint.background },
        pressed && styles.pressed,
      ]}
    >
      <EntityGlyph
        entity={entity}
        size={14}
        color={tint.foreground}
        strokeWidth={2}
      />
      <Text
        variant="footnote"
        weight="medium"
        color={tint.foreground}
        numberOfLines={1}
        style={styles.label}
      >
        {text}
      </Text>
    </Pressable>
  );
}

export function EntityIconBox({ entity }: { entity: ChatEntity }) {
  const tint = entityColors[entity.kind];

  return (
    <View style={[styles.iconBox, { backgroundColor: tint.background }]}>
      <EntityGlyph
        entity={entity}
        size={13}
        color={tint.foreground}
        strokeWidth={2.25}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    maxWidth: "100%",
    minHeight: 30,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  label: { flexShrink: 1 },
  pressed: { opacity: 0.7 },
  iconBox: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
});
