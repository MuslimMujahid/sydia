import { useQuery } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import { LogOut } from "lucide-react-native";
import { useState, type ComponentType } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Avatar } from "@/components/ui/controls";
import {
  BellGlyph,
  CalendarGlyph,
  ContactGlyph,
  FolderGlyph,
  MemoryGlyph,
  NoteGlyph,
  ReceiptGlyph,
  SettingsGlyph,
  ShieldGlyph,
  TaskListGlyph,
  type GlyphHue,
  type GlyphProps,
} from "@/components/ui/glyphs";
import { ListRow, ListSection } from "@/components/ui/list";
import { Text } from "@/components/ui/text";
import { authClient } from "@/lib/auth-client";
import { localized } from "@/lib/i18n";
import { useProfile } from "@/lib/profile";
import { billingStatusQueryOptions } from "@/lib/services/api/billing/billing.api";
import { colors, radius, spacing } from "@/lib/theme";

type MenuItem = {
  key: string;
  href: Href;
  label: string;
  badge?: string | null;
  glyph: ComponentType<GlyphProps>;
  hue: GlyphHue;
};

type MenuGroup = { title: string; items: MenuItem[] };

const BILLING_LABEL = {
  disabled: null,
  trial: ["Masa coba", "Trial"],
  paid: ["Aktif", "Active"],
  expired: ["Berakhir", "Expired"],
} as const;

function menuGroups(billingBadge: string | null): MenuGroup[] {
  return [
    {
      title: localized("Simpan & atur", "Organize"),
      items: [
        {
          key: "calendar",
          href: "/calendar",
          label: localized("Kalender", "Calendar"),
          glyph: CalendarGlyph,
          hue: "coral",
        },
        {
          key: "tasks",
          href: "/tasks",
          label: localized("Tugas", "Tasks"),
          glyph: TaskListGlyph,
          hue: "violet",
        },
        {
          key: "notes",
          href: "/notes",
          label: localized("Catatan", "Notes"),
          glyph: NoteGlyph,
          hue: "amber",
        },
        {
          key: "reminders",
          href: "/reminders",
          label: localized("Pengingat", "Reminders"),
          glyph: BellGlyph,
          hue: "amber",
        },
        {
          key: "files",
          href: "/files",
          label: localized("File", "Files"),
          glyph: FolderGlyph,
          hue: "coral",
        },
        {
          key: "contacts",
          href: "/contacts",
          label: localized("Kontak", "Contacts"),
          glyph: ContactGlyph,
          hue: "violet",
        },
        {
          key: "secrets",
          href: "/secrets",
          label: localized("Rahasia", "Secrets"),
          glyph: ShieldGlyph,
          hue: "coral",
        },
      ],
    },
    {
      title: localized("Pengaturan", "Settings"),
      items: [
        {
          key: "assistant",
          href: "/settings/assistant",
          label: localized("Asisten", "Assistant"),
          glyph: MemoryGlyph,
          hue: "violet",
        },
        {
          key: "notifications",
          href: "/settings/notifications",
          label: localized("Notifikasi", "Notifications"),
          glyph: BellGlyph,
          hue: "coral",
        },
        {
          key: "integrations",
          href: "/settings/integrations",
          label: localized("Integrasi", "Integrations"),
          glyph: SettingsGlyph,
          hue: "amber",
        },
        {
          key: "billing",
          href: "/settings/billing",
          label: localized("Langganan", "Billing"),
          badge: billingBadge,
          glyph: ReceiptGlyph,
          hue: "violet",
        },
      ],
    },
  ];
}

function MenuTile({ item, onPress }: { item: MenuItem; onPress: () => void }) {
  const Glyph = item.glyph;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        item.badge ? `${item.label}, ${item.badge}` : item.label
      }
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
    >
      <View style={styles.well}>
        <Glyph hue={item.hue} active size={26} />
      </View>
      <Text variant="footnote" weight="medium" align="center" numberOfLines={1}>
        {item.label}
      </Text>
      {item.badge ? (
        <Text variant="caption" tone="muted" align="center" numberOfLines={1}>
          {item.badge}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Feature menu opened from the home header: every area of the app, grouped. */
export default function MenuScreen() {
  const router = useRouter();
  const profile = useProfile();
  const billingQuery = useQuery(billingStatusQueryOptions());
  const [signingOut, setSigningOut] = useState(false);
  const billingLabel = billingQuery.data
    ? BILLING_LABEL[billingQuery.data.state]
    : null;
  const groups = menuGroups(
    billingLabel ? localized(billingLabel[0], billingLabel[1]) : null
  );

  function open(href: Href) {
    // Close the sheet first so the destination is pushed onto the main stack.
    router.back();
    router.push(href);
  }

  function confirmSignOut() {
    Alert.alert(
      localized("Keluar dari Sydia?", "Sign out of Sydia?"),
      localized(
        "Anda perlu masuk lagi untuk memakai aplikasi.",
        "You will need to sign in again to use the app."
      ),
      [
        { text: localized("Batal", "Cancel"), style: "cancel" },
        {
          text: localized("Keluar", "Sign out"),
          style: "destructive",
          onPress: async () => {
            setSigningOut(true);
            const result = await authClient.signOut();
            if (result.error) {
              setSigningOut(false);
              Alert.alert(
                localized("Tidak dapat keluar", "Could not sign out"),
                localized("Silakan coba lagi.", "Please try again.")
              );
            }
          },
        },
      ]
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ListSection>
        <ListRow
          title={profile.name}
          subtitle={profile.email}
          leading={<Avatar name={profile.name} size={44} />}
          onPress={() => open("/settings/profile")}
        />
      </ListSection>

      {groups.map((group) => (
        <View key={group.title} style={styles.group}>
          <Text
            variant="footnote"
            weight="semibold"
            tone="muted"
            style={styles.groupTitle}
            accessibilityRole="header"
          >
            {group.title}
          </Text>
          <View style={styles.grid}>
            {group.items.map((item) => (
              <MenuTile
                key={item.key}
                item={item}
                onPress={() => open(item.href)}
              />
            ))}
          </View>
        </View>
      ))}

      <ListSection>
        <ListRow
          title={
            signingOut
              ? localized("Keluar…", "Signing out…")
              : localized("Keluar", "Sign out")
          }
          icon={LogOut}
          destructive
          chevron={false}
          disabled={signingOut}
          onPress={confirmSignOut}
        />
      </ListSection>

      <Text variant="caption" tone="muted" align="center">
        {localized("Sydia · zona waktu", "Sydia · time zone")}{" "}
        {profile.timezone}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingTop: spacing.xxl,
    gap: spacing.xl,
    paddingBottom: spacing.huge,
  },
  group: { gap: spacing.sm },
  groupTitle: { paddingHorizontal: spacing.xs },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.xs,
  },
  tile: {
    width: "25%",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.sm,
  },
  tilePressed: { backgroundColor: colors.pressed },
  well: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
});
