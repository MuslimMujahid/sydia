import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Alert, Linking, StyleSheet } from "react-native";
import { WHATSAPP_INTEGRATION_ENABLED } from "@/components/settings/app-flags";
import {
  deriveWhatsAppView,
  formatCountdown,
  whatsappMessageUrl,
} from "@/components/settings/integration-status";
import { SettingsScroll } from "@/components/settings/settings-scroll";
import { useAuthHeaders } from "@/components/files/use-auth-headers";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  ErrorState,
  InlineError,
  LoadingState,
} from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { useToast } from "@/components/ui/toast";
import {
  getWhatsAppQrAssetUrl,
  type WhatsAppLinkCode,
  type WhatsAppQr,
} from "@/lib/services/api/whatsapp/whatsapp.api";
import {
  useCreateWhatsAppLinkCode,
  useCreateWhatsAppQr,
  useReconnectWhatsApp,
  useReplaceWhatsAppOwner,
  useUnlinkWhatsApp,
  whatsappStatusQueryOptions,
} from "@/lib/services/api/whatsapp/whatsapp.queries";
import { colors, radius } from "@/lib/theme";

export default function WhatsAppSettingsScreen() {
  if (!WHATSAPP_INTEGRATION_ENABLED)
    return <EmptyState title="WhatsApp belum tersedia" />;
  return <WhatsAppConnection />;
}

function WhatsAppConnection() {
  const statusQuery = useQuery(whatsappStatusQueryOptions());
  const status = statusQuery.data;
  const createQr = useCreateWhatsAppQr();
  const createCode = useCreateWhatsAppLinkCode();
  const replaceOwner = useReplaceWhatsAppOwner();
  const reconnect = useReconnectWhatsApp();
  const unlink = useUnlinkWhatsApp();
  const headers = useAuthHeaders();
  const toast = useToast();
  const [attempt, setAttempt] = useState<WhatsAppQr | null>(null);
  const [code, setCode] = useState<WhatsAppLinkCode | null>(null);
  const [now, setNow] = useState(Date.now);
  const [previewError, setPreviewError] = useState<string>();
  const busy =
    createQr.isPending ||
    createCode.isPending ||
    replaceOwner.isPending ||
    reconnect.isPending ||
    unlink.isPending;
  const view = deriveWhatsAppView(status, {
    attempt,
    code,
    qrPending: createQr.isPending,
    now,
  });

  useEffect(() => {
    if (!attempt && !code) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [attempt, code]);

  function requestQr() {
    setPreviewError(undefined);
    createQr.mutate(attempt ? { refresh: true } : undefined, {
      onSuccess: (answer) => {
        setNow(Date.now());
        setAttempt(answer);
      },
      onError: (error) =>
        console.warn("WhatsApp pairing QR could not be created", error),
    });
  }

  function requestCode(replacing = false) {
    const mutation = replacing ? replaceOwner : createCode;
    mutation.mutate(undefined, {
      onSuccess: (answer) => {
        setNow(Date.now());
        setCode(answer);
      },
      onError: (error) =>
        console.warn("WhatsApp verification code could not be created", error),
    });
  }

  function reportOpenError(error: unknown) {
    console.warn("WhatsApp verification action failed", error);
    toast("Kode verifikasi tidak dapat dibuka atau disalin.", {
      tone: "error",
    });
  }

  function confirmUnlink() {
    Alert.alert(
      "Putuskan WhatsApp?",
      "Sydia akan berhenti mengirim pengingat lewat WhatsApp.",
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Putuskan",
          style: "destructive",
          onPress: () =>
            unlink.mutate(undefined, {
              onSuccess: () => {
                setAttempt(null);
                setCode(null);
              },
              onError: (error) =>
                console.warn("WhatsApp disconnect failed", error),
            }),
        },
      ]
    );
  }

  if (statusQuery.isPending) return <LoadingState />;
  if (statusQuery.isError)
    return (
      <ErrorState
        title="Status WhatsApp tidak dapat dimuat"
        message={statusQuery.error.message}
        onRetry={() => void statusQuery.refetch()}
      />
    );

  const challenge = code && !view.expiredCode ? code : null;
  return (
    <SettingsScroll
      refreshing={statusQuery.isRefetching}
      onRefresh={() => void statusQuery.refetch()}
    >
      <Text variant="title" accessibilityRole="header">
        {view.label}
      </Text>
      {status?.assistantNumber ? (
        <Text>Nomor asisten · +{status.assistantNumber}</Text>
      ) : null}
      {status?.ownerNumber ? (
        <Text>Nomor pribadi · +{status.ownerNumber}</Text>
      ) : null}
      {view.ownerVerification ? (
        <>
          <Text tone="muted">
            Kirim kode dari nomor WhatsApp pribadi Anda ke nomor asisten untuk
            menyelesaikan verifikasi.
          </Text>
          <Button
            label={
              view.ownerConflict
                ? "Ganti nomor pribadi"
                : challenge
                  ? "Buat kode baru"
                  : "Buat kode verifikasi"
            }
            disabled={busy}
            loading={createCode.isPending || replaceOwner.isPending}
            onPress={() => requestCode(view.ownerConflict)}
          />
          {challenge ? (
            <>
              <Text variant="mono" selectable>
                {challenge.code}
              </Text>
              <Text tone="muted" variant="footnote">
                Sisa waktu{" "}
                {formatCountdown(Date.parse(challenge.expiresAt) - now)}
              </Text>
              {status?.assistantNumber ? (
                <Button
                  label="Buka WhatsApp"
                  variant="secondary"
                  onPress={() => {
                    if (status.assistantNumber)
                      void Linking.openURL(
                        whatsappMessageUrl(
                          status.assistantNumber,
                          challenge.code
                        )
                      ).catch(reportOpenError);
                  }}
                />
              ) : null}
              <Button
                label="Salin kode"
                variant="outline"
                onPress={() => {
                  void Clipboard.setStringAsync(challenge.code)
                    .then(() => toast("Kode disalin"))
                    .catch(reportOpenError);
                }}
              />
            </>
          ) : null}
        </>
      ) : !status?.linked && !status?.connected ? (
        <>
          <Text tone="muted">
            Di ponsel asisten, buka WhatsApp → Perangkat tertaut → Tautkan
            perangkat. Pindai kode QR dari perangkat lain.
          </Text>
          {attempt && headers && !view.expiredQr ? (
            <>
              <Image
                source={{
                  uri: getWhatsAppQrAssetUrl(attempt.attemptId),
                  headers,
                }}
                cachePolicy="none"
                accessibilityLabel="Kode QR WhatsApp"
                contentFit="contain"
                onError={({ error }) => {
                  console.warn(
                    "WhatsApp pairing QR image could not be loaded",
                    error
                  );
                  setPreviewError(
                    "Gambar QR belum bisa dimuat. Buat kode baru untuk mencoba lagi."
                  );
                }}
                style={styles.qr}
              />
              <Text variant="footnote" tone="muted">
                Sisa waktu{" "}
                {formatCountdown(Date.parse(attempt.expiresAt) - now)}
              </Text>
            </>
          ) : null}
          <Button
            label={attempt ? "Buat kode QR baru" : "Tampilkan kode QR"}
            loading={createQr.isPending}
            onPress={requestQr}
          />
        </>
      ) : !status.connected ? (
        <Button
          label="Sambungkan kembali"
          disabled={busy}
          loading={reconnect.isPending}
          onPress={() =>
            reconnect.mutate(undefined, {
              onError: (error) =>
                console.warn("WhatsApp reconnect failed", error),
            })
          }
        />
      ) : null}
      {status?.linked || status?.connected || view.ownerVerification ? (
        <Button
          label="Putuskan koneksi"
          variant="destructive"
          disabled={busy}
          onPress={confirmUnlink}
        />
      ) : null}
      <InlineError
        message={
          previewError ??
          createQr.error?.message ??
          createCode.error?.message ??
          replaceOwner.error?.message ??
          reconnect.error?.message ??
          unlink.error?.message
        }
      />
    </SettingsScroll>
  );
}

const styles = StyleSheet.create({
  qr: {
    width: 230,
    height: 230,
    alignSelf: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md,
  },
});
