import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { CodeInput } from "@/components/auth/code-input";
import { WEB_APP_URL } from "@/components/settings/app-flags";
import { SettingsScroll } from "@/components/settings/settings-scroll";
import { Button } from "@/components/ui/button";
import { ErrorState, InlineError, LoadingState } from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import { getAuthMethods, requestAuth } from "@/lib/services/api/auth/auth.api";
import { recheckSession } from "@/lib/services/api/api";
import { userQueryKeys } from "@/lib/services/api/users/users.queries";

export default function ChangeEmailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const methods = useQuery({
    queryKey: ["auth", "methods"],
    queryFn: getAuthMethods,
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [destination, setDestination] = useState<string>();
  const send = useMutation({
    mutationFn: (values: { newEmail: string; currentPassword?: string }) =>
      requestAuth("email-otp/request-email-change", values),
    onError: (error) =>
      console.warn("Email change code could not be sent", { name: error.name }),
    onSuccess: (_response, { newEmail }) => {
      setDestination(newEmail);
      setPassword("");
    },
  });
  const verify = useMutation({
    mutationFn: (values: { newEmail: string; otp: string }) =>
      requestAuth("email-otp/change-email", values),
    onError: (error) =>
      console.warn("Email change could not be verified", { name: error.name }),
    onSuccess: () => {
      recheckSession();
      void queryClient.invalidateQueries({ queryKey: userQueryKeys.current() });
      toast("Email berhasil diubah");
      router.back();
    },
  });

  async function openWeb() {
    if (!WEB_APP_URL) return;
    try {
      await WebBrowser.openBrowserAsync(`${WEB_APP_URL}/change-email`);
    } catch (error) {
      console.warn("Email change page could not be opened", error);
      toast("Halaman ubah email tidak dapat dibuka.", { tone: "error" });
    }
  }

  if (methods.isPending) return <LoadingState />;
  if (methods.isError)
    return (
      <ErrorState
        title="Metode masuk tidak dapat dimuat"
        message={methods.error.message}
        onRetry={() => void methods.refetch()}
      />
    );
  if (!methods.data.password)
    return (
      <SettingsScroll>
        <Text>
          Konfirmasi akun Google melalui halaman Ubah email di Sydia web.
        </Text>
        {WEB_APP_URL ? (
          <Button label="Ubah email di web" onPress={() => void openWeb()} />
        ) : null}
      </SettingsScroll>
    );

  return (
    <SettingsScroll>
      {destination ? (
        <>
          <Text>Masukkan kode verifikasi yang dikirim ke {destination}.</Text>
          <CodeInput
            value={code}
            onChange={setCode}
            disabled={verify.isPending}
          />
          <Button
            label="Verifikasi email baru"
            disabled={code.length !== 6}
            loading={verify.isPending}
            onPress={() => verify.mutate({ newEmail: destination, otp: code })}
          />
          <Button
            label="Kirim kode lagi"
            variant="outline"
            loading={send.isPending}
            disabled={verify.isPending}
            onPress={() => send.mutate({ newEmail: destination })}
          />
          <Button
            label="Koreksi alamat email"
            variant="ghost"
            disabled={verify.isPending || send.isPending}
            onPress={() => {
              setDestination(undefined);
              setCode("");
              verify.reset();
              send.reset();
            }}
          />
        </>
      ) : (
        <>
          <TextField
            label="Email baru"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <TextField
            label="Kata sandi saat ini"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
          />
          <Button
            label="Kirim kode verifikasi"
            disabled={!/^\S+@\S+\.\S+$/.test(email.trim()) || !password}
            loading={send.isPending}
            onPress={() =>
              send.mutate({ newEmail: email.trim(), currentPassword: password })
            }
          />
        </>
      )}
      <InlineError message={verify.error?.message ?? send.error?.message} />
    </SettingsScroll>
  );
}
