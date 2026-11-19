import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/button";
import { TextField } from "@/components/text-field";
import { authClient } from "@/lib/auth-client";
import { colors, spacing } from "@/lib/theme";

const SIGN_IN_FAILED =
  "Anda tidak dapat masuk. Periksa email dan kata sandi Anda.";

export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSignIn() {
    setError(null);
    setSubmitting(true);

    try {
      // On success the session store updates and the root layout's
      // protected routes move the user to the home screen.
      const result = await authClient.signIn.email({
        email: email.trim(),
        password,
      });
      if (result.error)
        setError(result.error.message?.trim() || SIGN_IN_FAILED);
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : SIGN_IN_FAILED
      );
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = email.trim().length > 0 && password.length > 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Masuk ke Sydia</Text>
          <Text style={styles.subtitle}>
            Gunakan akun yang sama dengan aplikasi web.
          </Text>
        </View>

        <View style={styles.form}>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
          />
          <TextField
            label="Kata sandi"
            value={password}
            onChangeText={setPassword}
            autoComplete="current-password"
            secureTextEntry
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={() => {
              if (canSubmit && !submitting) void handleSignIn();
            }}
          />

          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}

          <Button
            label="Masuk"
            onPress={() => void handleSignIn()}
            loading={submitting}
            disabled={!canSubmit}
          />
        </View>
      </KeyboardAvoidingView>
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
  form: { gap: spacing.md },
  error: { fontSize: 14, color: colors.destructive },
});
