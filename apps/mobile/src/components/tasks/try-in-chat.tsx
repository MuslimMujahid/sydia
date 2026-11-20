import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowUp } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { AuroraFill } from "@/components/ui/aurora";
import { Text } from "@/components/ui/text";
import { userPreferencesQueryOptions } from "@/lib/services/api/users/users.queries";
import { colors, radius, shadows, spacing } from "@/lib/theme";
import { pageExample, type ExampleTopic } from "./chat-examples";

/**
 * The web's TryInChat: an example message drawn as a small composer. Tapping
 * it opens a new chat with the message already typed.
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
          <ArrowUp size={16} color={colors.white} strokeWidth={2.4} />
        </View>
      </Pressable>
      <Text variant="caption" tone="muted" accessibilityElementsHidden>
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
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: shadows.card,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  example: { flex: 1 },
  send: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: shadows.button,
  },
});
