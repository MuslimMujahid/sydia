import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Stack, useFocusEffect } from "expo-router";
import {
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Link2,
  Plus,
  Share2,
  Trash2,
} from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Alert, AppState, Modal, Share, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useActionSheet } from "@/components/ui/action-sheet";
import { Button, IconButton } from "@/components/ui/button";
import { FormScroll, HeaderTextButton } from "@/components/ui/form";
import { ListRow, ListSection } from "@/components/ui/list";
import {
  EmptyState,
  ErrorState,
  InlineError,
  ListSkeleton,
} from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import { useProfile } from "@/lib/profile";
import { ApiClientError } from "@/lib/services/api/api";
import {
  createRevealLink,
  createSecret,
  revealSecretInSession,
  unlockSecretVault,
  type RevealedSecret,
  type RevealLink,
  type SecretMetadata,
} from "@/lib/services/api/secrets/secrets.api";
import {
  secretQueryKeys,
  secretsQueryOptions,
  useDeleteSecret,
} from "@/lib/services/api/secrets/secrets.queries";
import { colors, radius, spacing } from "@/lib/theme";
import { formatDateTimeInZone } from "@/lib/utils/date-time";

type VaultPanel =
  | { type: "new" }
  | { type: "reveal"; secret: SecretMetadata }
  | { type: "link"; link: RevealLink; label: string };

export function SecretsVault() {
  const [panel, setPanel] = useState<VaultPanel | null>(null);
  const [error, setError] = useState<string>();
  const [linkPending, setLinkPending] = useState(false);
  const sheet = useActionSheet();
  const toast = useToast();
  const query = useQuery(secretsQueryOptions());
  const remove = useDeleteSecret();
  const active = useRef(false);
  const linkRequest = useRef(false);

  useFocusEffect(
    useCallback(() => {
      active.current = AppState.currentState === "active";
      const appState = AppState.addEventListener("change", (state) => {
        active.current = state === "active";
        if (!active.current) setPanel(null);
      });
      return () => {
        active.current = false;
        setPanel(null);
        appState.remove();
      };
    }, [])
  );

  async function issue(secret: SecretMetadata) {
    if (linkRequest.current) return;
    linkRequest.current = true;
    setLinkPending(true);
    setError(undefined);
    try {
      const link = await createRevealLink(secret.id);
      if (active.current) setPanel({ type: "link", link, label: secret.label });
    } catch (caught) {
      console.warn("Could not create a vault reveal link", {
        name: caught instanceof Error ? caught.name : "UnknownError",
      });
      setError(
        caught instanceof Error ? caught.message : "Tautan belum dapat dibuat."
      );
    } finally {
      linkRequest.current = false;
      setLinkPending(false);
    }
  }

  function open(secret: SecretMetadata) {
    sheet({
      title: secret.label,
      options: [
        {
          label: "Tampilkan nilai",
          icon: Eye,
          onPress: () => setPanel({ type: "reveal", secret }),
        },
        {
          label: "Buat tautan sekali pakai",
          icon: Link2,
          onPress: () => void issue(secret),
        },
        {
          label: "Hapus rahasia",
          icon: Trash2,
          destructive: true,
          onPress: () =>
            Alert.alert(
              "Hapus rahasia?",
              `“${secret.label}” akan dihapus permanen.`,
              [
                { text: "Batal", style: "cancel" },
                {
                  text: "Hapus",
                  style: "destructive",
                  onPress: () =>
                    remove.mutate(secret.id, {
                      onSuccess: () => toast("Rahasia dihapus"),
                    }),
                },
              ]
            ),
        },
      ],
    });
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton
              size={44}
              icon={Plus}
              accessibilityLabel="Tambah rahasia"
              onPress={() => setPanel({ type: "new" })}
            />
          ),
        }}
      />
      <FormScroll>
        <InlineError message={error || remove.error?.message} />
        {linkPending ? (
          <Text
            variant="footnote"
            tone="muted"
            accessibilityLiveRegion="polite"
          >
            Membuat tautan…
          </Text>
        ) : null}
        {query.isPending ? (
          <ListSkeleton />
        ) : query.isError ? (
          <ErrorState
            title="Rahasia tidak dapat dimuat"
            message={query.error.message}
            onRetry={() => void query.refetch()}
          />
        ) : query.data.length ? (
          <ListSection>
            {query.data.map((secret) => (
              <ListRow
                key={secret.id}
                title={secret.label}
                icon={KeyRound}
                disabled={linkPending || remove.isPending}
                onPress={() => open(secret)}
              />
            ))}
          </ListSection>
        ) : (
          <EmptyState
            title="Belum ada rahasia"
            message="Simpan nilai sensitif dan bagikan melalui tautan yang hanya dapat digunakan satu kali."
            action={
              <Button
                label="Tambah rahasia"
                icon={Plus}
                variant="primary"
                onPress={() => setPanel({ type: "new" })}
              />
            }
          />
        )}
      </FormScroll>
      {panel?.type === "new" ? (
        <SecretCreator onClose={() => setPanel(null)} />
      ) : null}
      {panel?.type === "reveal" ? (
        <DirectReveal secret={panel.secret} onClose={() => setPanel(null)} />
      ) : null}
      {panel?.type === "link" ? (
        <LinkPanel
          link={panel.link}
          label={panel.label}
          onClose={() => setPanel(null)}
        />
      ) : null}
    </>
  );
}

function VaultPanelView({
  title,
  onClose,
  children,
  saving = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  saving?: boolean;
}) {
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={saving ? undefined : onClose}
    >
      <SafeAreaView style={styles.modal} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Text
            variant="headline"
            accessibilityRole="header"
            numberOfLines={1}
            style={styles.headerTitle}
          >
            {title}
          </Text>
          <HeaderTextButton label="Tutup" onPress={onClose} disabled={saving} />
        </View>
        <FormScroll>{children}</FormScroll>
      </SafeAreaView>
    </Modal>
  );
}

function SecretCreator({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const pending = useRef(false);

  async function save() {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError(undefined);
    try {
      await createSecret({ label: label.trim(), value });
      void queryClient.invalidateQueries({ queryKey: secretQueryKeys.all });
      toast("Rahasia disimpan");
      onClose();
    } catch (caught) {
      console.warn("Secret creation failed", {
        name: caught instanceof Error ? caught.name : "UnknownError",
      });
      setError(
        caught instanceof Error
          ? caught.message
          : "Rahasia belum dapat disimpan."
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <VaultPanelView title="Rahasia baru" onClose={onClose} saving={saving}>
      <TextField
        label="Label"
        value={label}
        onChangeText={setLabel}
        maxLength={120}
        editable={!saving}
      />
      <TextField
        label="Nilai rahasia"
        value={value}
        onChangeText={setValue}
        maxLength={8192}
        editable={!saving}
        secureTextEntry={!visible}
        multiline={visible}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
      />
      <Button
        size="sm"
        variant="ghost"
        icon={visible ? EyeOff : Eye}
        label={visible ? "Sembunyikan nilai" : "Tampilkan nilai"}
        onPress={() => setVisible(!visible)}
      />
      <InlineError message={error} />
      <Button
        label="Simpan rahasia"
        variant="primary"
        loading={saving}
        disabled={!label.trim() || !value.length}
        onPress={() => void save()}
      />
    </VaultPanelView>
  );
}

function DirectReveal({
  secret,
  onClose,
}: {
  secret: SecretMetadata;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [locked, setLocked] = useState(false);
  const [revealed, setRevealed] = useState<RevealedSecret>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const pending = useRef(false);
  const clipboard = useClipboardAction();

  useEffect(() => {
    if (!revealed) return;
    const expiry = Date.parse(revealed.expiresAt);
    const timeout = setTimeout(
      onClose,
      Number.isFinite(expiry) ? Math.max(0, expiry - Date.now()) : 0
    );
    return () => clearTimeout(timeout);
  }, [revealed, onClose]);

  async function reveal() {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError(undefined);
    try {
      if (locked) await unlockSecretVault(password);
      setPassword("");
      const result = await revealSecretInSession(secret.id);
      setRevealed(result);
    } catch (caught) {
      console.warn("Could not reveal secret in vault session", {
        name: caught instanceof Error ? caught.name : "UnknownError",
      });
      if (
        !locked &&
        caught instanceof ApiClientError &&
        caught.status === 403
      ) {
        setLocked(true);
      } else {
        setError(
          caught instanceof Error
            ? caught.message
            : "Nilai rahasia tidak dapat dibuka."
        );
      }
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <VaultPanelView title={secret.label} onClose={onClose} saving={saving}>
      {revealed ? (
        <>
          <Text variant="footnote" tone="muted">
            Nilai disembunyikan setelah 30 detik.
          </Text>
          <Text variant="mono" style={styles.value}>
            {revealed.value}
          </Text>
          <Button
            icon={Copy}
            label="Salin nilai"
            onPress={() => void clipboard.copy(revealed.value)}
          />
          <Button
            icon={EyeOff}
            label="Sembunyikan"
            variant="outline"
            onPress={onClose}
          />
        </>
      ) : (
        <>
          {locked ? (
            <>
              <Text tone="muted">
                Konfirmasikan kata sandi akun untuk membuka rahasia selama sesi
                ini.
              </Text>
              <TextField
                label="Kata sandi akun"
                secureTextEntry
                autoComplete="current-password"
                value={password}
                onChangeText={setPassword}
                maxLength={256}
                editable={!saving}
              />
            </>
          ) : (
            <Text tone="muted">Nilai akan ditampilkan selama 30 detik.</Text>
          )}
          <Button
            icon={Eye}
            label="Tampilkan nilai"
            variant="primary"
            loading={saving}
            disabled={locked && !password}
            onPress={() => void reveal()}
          />
        </>
      )}
      <InlineError message={error || clipboard.error} />
    </VaultPanelView>
  );
}

function LinkPanel({
  link,
  label,
  onClose,
}: {
  link: RevealLink;
  label: string;
  onClose: () => void;
}) {
  const { timezone, locale } = useProfile();
  const clipboard = useClipboardAction();
  const [shareError, setShareError] = useState<string>();

  async function share() {
    setShareError(undefined);
    try {
      await Share.share({ message: link.url });
    } catch (caught) {
      console.warn("Could not open secret reveal link share sheet", {
        name: caught instanceof Error ? caught.name : "UnknownError",
      });
      setShareError("Menu berbagi tidak dapat dibuka.");
    }
  }

  return (
    <VaultPanelView title="Tautan sekali pakai" onClose={onClose}>
      <Text>
        Tautan untuk “{label}” berlaku hingga{" "}
        {formatDateTimeInZone(link.expiresAt, timezone, locale)}. Siapa pun yang
        membukanya dapat melihat nilai rahasia.
      </Text>
      <Text variant="mono" style={styles.value} selectable>
        {link.url}
      </Text>
      <Button
        icon={Share2}
        label="Bagikan tautan"
        variant="primary"
        onPress={() => void share()}
      />
      <Button
        icon={Copy}
        label="Salin tautan"
        variant="outline"
        onPress={() => void clipboard.copy(link.url)}
      />
      <InlineError message={shareError || clipboard.error} />
    </VaultPanelView>
  );
}

function useClipboardAction() {
  const [error, setError] = useState<string>();
  const toast = useToast();

  async function copy(value: string) {
    setError(undefined);
    try {
      const copied = await Clipboard.setStringAsync(value);
      if (!copied) throw new Error("Papan klip tidak tersedia.");
      toast("Disalin ke papan klip");
    } catch (caught) {
      console.warn("Vault clipboard action failed", {
        name: caught instanceof Error ? caught.name : "UnknownError",
      });
      setError("Tidak dapat menyalin ke papan klip.");
    }
  }

  return { error, copy };
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    padding: spacing.lg,
  },
  headerTitle: { flex: 1 },
  value: {
    padding: spacing.md,
    backgroundColor: colors.muted,
    borderRadius: radius.sm,
  },
});
