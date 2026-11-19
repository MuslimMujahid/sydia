import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/button";
import { authClient } from "@/lib/auth-client";
import { colors, spacing } from "@/lib/theme";

export default function HomeScreen() {
  const { data: session } = authClient.useSession();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    setError(null);
    setSigningOut(true);

    const result = await authClient.signOut();
    if (result.error) {
      setError("Anda tidak dapat keluar. Silakan coba lagi.");
      setSigningOut(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>
            Halo, {session?.user.name ?? "di sana"}
          </Text>
          <Text style={styles.subtitle}>{session?.user.email}</Text>
        </View>

        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}

        <Button
          label="Keluar"
          variant="outline"
          onPress={() => void handleSignOut()}
          loading={signingOut}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    gap: spacing.xl,
  },
  header: { gap: spacing.sm },
  title: { fontSize: 28, fontWeight: "700", color: colors.foreground },
  subtitle: { fontSize: 16, color: colors.mutedForeground },
  error: { fontSize: 14, color: colors.destructive },
});
