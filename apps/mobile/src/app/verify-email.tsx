import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AuthShell } from "@/components/auth/auth-shell";
import { CodeInput } from "@/components/auth/code-input";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { authClient } from "@/lib/auth-client";
import {
  sendVerificationCode,
  verifyEmailCode,
} from "@/lib/services/api/auth/auth.api";
import { spacing } from "@/lib/theme";

const RESEND_SECONDS = 60;

/** Shown while signed in with an unverified email (right after sign-up). */
export default function VerifyEmailScreen() {
  const { data: session } = authClient.useSession();
  const email = session?.user.email ?? "";
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const autoSent = useRef(false);

  const send = useMutation({
    mutationFn: () => sendVerificationCode(email),
    onSuccess: () => setCooldown(RESEND_SECONDS),
  });

  const verify = useMutation({
    mutationFn: (otp: string) => verifyEmailCode(email, otp),
    // A verified session moves the root layout into the app.
    onSuccess: () => authClient.$store.notify("$sessionSignal"),
    onError: () => setCode(""),
  });

  const { mutate: sendCode } = send;

  useEffect(() => {
    if (!email || autoSent.current) return;
    autoSent.current = true;
    sendCode();
  }, [email, sendCode]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1_000);

    return () => clearTimeout(timer);
  }, [cooldown]);

  return (
    <AuthShell
      title="Periksa email Anda"
      subtitle={
        <Text variant="body" tone="muted">
          Masukkan kode 6 digit yang dikirim ke{" "}
          <Text variant="body" weight="semibold">
            {email}
          </Text>
        </Text>
      }
      footer={
        <Button
          label="Keluar dan gunakan email lain"
          variant="ghost"
          onPress={() => void authClient.signOut()}
        />
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
        label="Verifikasi email"
        variant="primary"
        fullWidth
        loading={verify.isPending}
        disabled={code.length !== 6}
        onPress={() => verify.mutate(code)}
      />
      <View style={styles.resend}>
        <Button
          label={
            cooldown > 0
              ? `Kirim ulang kode (${cooldown} dtk)`
              : "Kirim ulang kode"
          }
          variant="ghost"
          size="sm"
          loading={send.isPending}
          disabled={cooldown > 0}
          onPress={() => send.mutate()}
        />
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  resend: { alignItems: "center", marginTop: -spacing.sm },
});
