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

const SIGN_UP_FAILED =
  "Akun Anda tidak dapat dibuat. Periksa data Anda, lalu coba lagi.";
const MIN_PASSWORD = 8;

export default function SignUpScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);

  const passwordTooShort =
    password.length > 0 && password.length < MIN_PASSWORD;
  const canSubmit =
    name.trim().length > 0 &&
    /\S+@\S+\.\S+/.test(email.trim()) &&
    password.length >= MIN_PASSWORD;

  async function handleSignUp() {
    setError(null);
    setSubmitting(true);

    try {
      // A new account starts signed in but unverified; the root layout then
      // shows the email code step.
      const result = await authClient.signUp.email({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      if (result.error)
        setError(result.error.message?.trim() || SIGN_UP_FAILED);
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : SIGN_UP_FAILED
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Buat akun Sydia"
      subtitle="Asisten pribadi untuk urusan sehari-hari: pengingat, jadwal, catatan, dan file."
      footer={
        <Text variant="callout" tone="muted">
          Sudah punya akun?{" "}
          <Link href="/sign-in" replace>
            <Text variant="callout" weight="semibold">
              Masuk
            </Text>
          </Link>
        </Text>
      }
    >
      <TextField
        label="Nama"
        value={name}
        onChangeText={setName}
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => emailRef.current?.focus()}
      />
      <TextField
        ref={emailRef}
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
        autoComplete="new-password"
        textContentType="newPassword"
        secureTextEntry
        returnKeyType="go"
        hint={`Minimal ${MIN_PASSWORD} karakter.`}
        error={
          passwordTooShort ? `Gunakan minimal ${MIN_PASSWORD} karakter.` : null
        }
        onSubmitEditing={() => {
          if (canSubmit && !submitting) void handleSignUp();
        }}
      />
      <InlineError message={error} />
      <Button
        label="Buat akun"
        variant="primary"
        fullWidth
        onPress={() => void handleSignUp()}
        loading={submitting}
        disabled={!canSubmit}
      />
      <GoogleSignIn disabled={submitting} />
    </AuthShell>
  );
}
