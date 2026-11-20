import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { CircleCheck } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { AuthShell } from "@/components/auth/auth-shell";
import { CodeInput } from "@/components/auth/code-input";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";
import { ApiClientError } from "@/lib/services/api/api";
import { requestAuth } from "@/lib/services/api/auth/auth.api";
import { colors, radius, spacing } from "@/lib/theme";

type Step = "email" | "code" | "password" | "done";
const MIN_PASSWORD = 8;

/** Email code recovery, mirroring the web's forgot-password flow. */
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");

  const send = useMutation({
    mutationFn: () =>
      requestAuth("email-otp/request-password-reset", { email: email.trim() }),
    onSuccess: () => setStep("code"),
  });

  const verify = useMutation({
    mutationFn: (otp: string) =>
      requestAuth<{ token: string }>("recovery/verify-code", {
        email: email.trim(),
        otp,
      }),
    onSuccess: (result) => {
      setToken(result.token);
      setStep("password");
    },
    onError: () => setCode(""),
  });

  const reset = useMutation({
    mutationFn: () =>
      requestAuth("recovery/reset-password", { token, password }),
    onSuccess: () => {
      setToken("");
      setStep("done");
    },
  });

  const unavailable =
    send.error instanceof ApiClientError &&
    send.error.code === "RECOVERY_UNAVAILABLE";

  if (unavailable)
    return (
      <AuthShell
        title="Belum bisa memulihkan akun"
        subtitle="Gunakan metode masuk yang sudah terhubung. Tanpa akses email atau login, pemulihan otomatis belum tersedia."
      >
        <Button
          label="Kembali ke masuk"
          variant="primary"
          fullWidth
          onPress={() => router.back()}
        />
      </AuthShell>
    );

  if (step === "done")
    return (
      <AuthShell
        title="Kata sandi diperbarui"
        subtitle="Silakan masuk menggunakan kata sandi baru."
      >
        <View style={styles.notice}>
          <CircleCheck size={20} color={colors.mutedForeground} />
          <Text variant="callout">Semua sesi sebelumnya telah diakhiri.</Text>
        </View>
        <Button
          label="Kembali ke masuk"
          variant="primary"
          fullWidth
          onPress={() => router.back()}
        />
      </AuthShell>
    );

  if (step === "code")
    return (
      <AuthShell
        title="Masukkan kode"
        subtitle={
          <Text variant="body" tone="muted">
            Masukkan kode pemulihan 6 digit untuk{" "}
            <Text variant="body" weight="semibold">
              {email.trim()}
            </Text>
          </Text>
        }
      >
        <CodeInput
          value={code}
          onChange={setCode}
          onComplete={(value) => verify.mutate(value)}
          disabled={verify.isPending}
        />
        <InlineError message={verify.error?.message ?? send.error?.message} />
        <Button
          label="Lanjutkan"
          variant="primary"
          fullWidth
          loading={verify.isPending}
          disabled={code.length !== 6}
          onPress={() => verify.mutate(code)}
        />
        <Button
          label="Kirim ulang kode"
          variant="ghost"
          size="sm"
          loading={send.isPending}
          onPress={() => send.mutate()}
          style={styles.center}
        />
      </AuthShell>
    );

  if (step === "password")
    return (
      <AuthShell
        title="Buat kata sandi baru"
        subtitle="Gunakan kata sandi yang belum pernah Anda pakai."
      >
        <TextField
          label="Kata sandi baru"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          hint={`Minimal ${MIN_PASSWORD} karakter.`}
        />
        <InlineError message={reset.error?.message} />
        <Button
          label="Simpan kata sandi"
          variant="primary"
          fullWidth
          loading={reset.isPending}
          disabled={password.length < MIN_PASSWORD}
          onPress={() => reset.mutate()}
        />
      </AuthShell>
    );

  return (
    <AuthShell
      title="Lupa kata sandi?"
      subtitle="Kami akan mengirim kode pemulihan ke email akun Anda."
      footer={
        <Button
          label="Kembali ke masuk"
          variant="ghost"
          onPress={() => router.back()}
        />
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
        returnKeyType="send"
        onSubmitEditing={() => {
          if (email.trim()) send.mutate();
        }}
      />
      <InlineError message={send.error?.message} />
      <Button
        label="Kirim kode"
        variant="primary"
        fullWidth
        loading={send.isPending}
        disabled={!/\S+@\S+\.\S+/.test(email.trim())}
        onPress={() => send.mutate()}
      />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.sm,
    backgroundColor: colors.muted,
  },
  center: { alignSelf: "center" },
});
