import { Link } from "expo-router";
import { useRef, useState } from "react";
import type { TextInputInstance } from "react-native";
import { GoogleSignIn } from "@/components/auth/google-sign-in";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";
import { authClient } from "@/lib/auth-client";

const SIGN_IN_FAILED =
  "Anda tidak dapat masuk. Periksa email dan kata sandi Anda.";

export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<TextInputInstance>(null);

  async function handleSignIn() {
    setError(null);
    setSubmitting(true);

    try {
      // On success the session store updates and the root layout's
      // protected routes move the user into the app.
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
    <AuthShell
      title="Masuk ke Sydia"
      subtitle="Gunakan akun yang sama dengan aplikasi web."
      footer={
        <>
          <Link href="/forgot-password" asChild>
            <Text
              variant="callout"
              weight="semibold"
              tone="muted"
              accessibilityRole="link"
            >
              Lupa kata sandi?
            </Text>
          </Link>
          <Text variant="callout" tone="muted">
            Belum punya akun?{" "}
            <Link href="/sign-up">
              <Text variant="callout" weight="semibold">
                Buat akun
              </Text>
            </Link>
          </Text>
        </>
      }
    >
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
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
      <InlineError message={error} />
      <Button
        label="Masuk"
        variant="primary"
        fullWidth
        onPress={() => void handleSignIn()}
        loading={submitting}
        disabled={!canSubmit}
      />
      <GoogleSignIn disabled={submitting} />
    </AuthShell>
  );
}
