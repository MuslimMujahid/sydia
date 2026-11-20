import { Check, Search, Smartphone } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { HeaderTextButton } from "@/components/ui/form";
import { Text } from "@/components/ui/text";
import { fonts } from "@/lib/fonts";
import { colors, radius, spacing } from "@/lib/theme";
import {
  INDONESIAN_TIME_ZONES,
  listTimeZones,
  searchTimeZones,
  timeZoneTitle,
  usableDeviceTimeZone,
  utcOffsetLabel,
} from "./timezones";

interface TimezonePickerProps {
  visible: boolean;
  value: string;
  onSelect: (zone: string) => void;
  onClose: () => void;
}

type Section = { title: string; data: string[] };

/**
 * Searchable IANA zone list in a native page sheet, with the device's own
 * zone and Indonesia's WIB/WITA/WIT offered first.
 */
export function TimezonePicker({
  visible,
  value,
  onSelect,
  onClose,
}: TimezonePickerProps) {
  const [query, setQuery] = useState("");
  const zones = useMemo(() => listTimeZones(), []);
  const deviceZone = useMemo(() => usableDeviceTimeZone(), []);
  const sections = useMemo<Section[]>(() => {
    const matches = searchTimeZones(zones, query);
    if (query.trim()) return [{ title: "Hasil pencarian", data: matches }];

    const suggested = [
      ...new Set([
        ...(deviceZone ? [deviceZone] : []),
        ...Object.keys(INDONESIAN_TIME_ZONES),
      ]),
    ];

    return [
      { title: "Disarankan", data: suggested },
      { title: "Semua zona waktu", data: matches },
    ];
  }, [deviceZone, query, zones]);

  function choose(zone: string) {
    onSelect(zone);
    setQuery("");
    onClose();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.sheet} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <HeaderTextButton label="Batal" onPress={onClose} />
          <Text variant="body" weight="semibold" accessibilityRole="header">
            Zona waktu
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.search}>
          <Search size={18} color={colors.mutedForeground} strokeWidth={2} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Cari kota atau zona (mis. Makassar)"
            placeholderTextColor={colors.mutedForeground}
            selectionColor={colors.accent}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Cari zona waktu"
            style={styles.searchInput}
          />
        </View>
        <SectionList
          sections={sections}
          keyExtractor={(zone, index) => `${zone}-${index}`}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          stickySectionHeadersEnabled={false}
          initialNumToRender={24}
          contentContainerStyle={styles.list}
          renderSectionHeader={({ section }) => (
            <Text
              variant="footnote"
              weight="semibold"
              tone="muted"
              style={styles.sectionTitle}
            >
              {section.title}
            </Text>
          )}
          ListEmptyComponent={
            <Text
              variant="callout"
              tone="muted"
              align="center"
              style={styles.empty}
            >
              Zona waktu tidak ditemukan.
            </Text>
          }
          renderItem={({ item: zone }) => {
            const selected = zone === value;
            const isDevice = zone === deviceZone;
            const offset = utcOffsetLabel(zone);

            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${timeZoneTitle(zone)}, ${offset}${isDevice ? ", zona waktu perangkat" : ""}`}
                onPress={() => choose(zone)}
                android_ripple={{ color: colors.pressed }}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <View style={styles.rowTexts}>
                  <Text
                    variant="body"
                    weight={selected ? "semibold" : "medium"}
                    numberOfLines={1}
                  >
                    {timeZoneTitle(zone)}
                  </Text>
                  <Text variant="footnote" tone="muted" numberOfLines={1}>
                    {zone} · {offset}
                  </Text>
                </View>
                {isDevice ? (
                  <Smartphone
                    size={16}
                    color={colors.mutedForeground}
                    strokeWidth={1.75}
                  />
                ) : null}
                {selected ? (
                  <Check size={20} color={colors.accent} strokeWidth={2.25} />
                ) : null}
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.background },
  header: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
  },
  headerSpacer: { width: 48 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.foreground,
    paddingVertical: spacing.sm,
  },
  list: { paddingBottom: spacing.huge },
  sectionTitle: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  row: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pressed: { backgroundColor: colors.pressed },
  rowTexts: { flex: 1, gap: 2 },
  empty: { padding: spacing.xxxl },
});
