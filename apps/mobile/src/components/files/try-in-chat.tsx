import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowUp } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { AuroraFill } from "@/components/ui/aurora";
import { Text } from "@/components/ui/text";
import type { UserOccupation } from "@/lib/services/api/users/users.api";
import { userPreferencesQueryOptions } from "@/lib/services/api/users/users.queries";
import { colors, radius, shadows, spacing } from "@/lib/theme";

export type ExampleTopic = "file" | "contact";

type ExampleGroup = "household" | "school" | "campus" | "work" | "business";

const EXAMPLE_GROUP: Record<UserOccupation, ExampleGroup> = {
  homemaker: "household",
  school_student: "school",
  university_student: "campus",
  office_worker: "work",
  freelancer: "work",
  business_owner: "business",
  other: "household",
};

// Mirrors the web's personalization examples (apps/frontend/src/lib/personalization).
const PAGE_EXAMPLES: Record<ExampleGroup, Record<ExampleTopic, string>> = {
  household: {
    contact: "Simpan nomor Bu Rina, wali kelas: 0812-3456-7890",
    file: "Simpan foto KK ini di folder Dokumen Keluarga",
  },
  school: {
    contact: "Simpan nomor Pak Budi, wali kelas: 0812-3456-7890",
    file: "Simpan foto jadwal pelajaran ini di folder Sekolah",
  },
  campus: {
    contact: "Simpan nomor Bu Sinta, dosen pembimbing: 0812-3456-7890",
    file: "Simpan PDF jurnal ini di folder Skripsi",
  },
  work: {
    contact: "Simpan nomor Pak Andi, klien PT Maju: 0812-3456-7890",
    file: "Simpan PDF kontrak ini di folder Kerjaan",
  },
  business: {
    contact: "Simpan nomor Bu Sari, pelanggan tetap: 0812-3456-7890",
    file: "Simpan foto nota supplier ini di folder Usaha",
  },
};

export function pageExample(
  topic: ExampleTopic,
  occupation: UserOccupation | null | undefined
): string {
  return PAGE_EXAMPLES[occupation ? EXAMPLE_GROUP[occupation] : "household"][
    topic
  ];
}

/**
 * An empty state's example message drawn as a small copy of the chat
 * composer. Tapping it opens a new chat with the message already typed.
 */
export function TryInChat({ topic }: { topic: ExampleTopic }) {
  const router = useRouter();
  // Until preferences load, or if they fail, the household example shows.
  const preferences = useQuery(userPreferencesQueryOptions());
  const example = pageExample(topic, preferences.data?.occupation);

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Buka di chat: ${example}`}
        onPress={() =>
          router.push({
            pathname: "/chat/[id]",
            params: { id: "new", draft: example },
          })
        }
        style={({ pressed }) => [styles.composer, pressed && styles.pressed]}
      >
        <Text variant="callout" style={styles.example}>
          {example}
        </Text>
        <View style={styles.send}>
          <AuroraFill grain={false} />
          <ArrowUp size={16} color={colors.white} strokeWidth={2.25} />
        </View>
      </Pressable>
      <Text variant="caption" tone="muted">
        Ketuk untuk mencobanya di chat
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: spacing.sm, alignSelf: "stretch" },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    alignSelf: "stretch",
    paddingVertical: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    boxShadow: shadows.card,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  example: { flex: 1 },
  send: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    boxShadow: shadows.button,
  },
});
