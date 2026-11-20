import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CalendarDays } from "lucide-react-native";
import { ScrollView, StyleSheet } from "react-native";
import { DateTimeField } from "@/components/ui/date-time-field";
import { ListRow, ListSection } from "@/components/ui/list";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/states";
import {
  dailyNoteHistory,
  validNoteRef,
} from "@/components/notes/workspace-model";
import { useProfile } from "@/lib/profile";
import { workspaceQueryOptions } from "@/lib/services/api/notes/notes.api";
import { spacing } from "@/lib/theme";
import {
  dayKeyInZone,
  formatDayInZone,
  startOfDayInZone,
  todayKey,
} from "@/lib/utils/date-time";

export default function DailyNotesScreen() {
  const router = useRouter();
  const { date } = useLocalSearchParams<{ date?: string }>();
  const profile = useProfile();
  const { timezone, locale } = profile;
  const today = todayKey(timezone);
  const selected = date && validNoteRef(`daily:${date}`) ? date : today;
  const workspace = useQuery(workspaceQueryOptions());
  const history = dailyNoteHistory(workspace.data?.notes ?? [], today);

  function open(ref: string) {
    router.push({ pathname: "/note/[ref]", params: { ref } });
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      <ListSection>
        <ListRow
          icon={CalendarDays}
          title="Hari ini"
          subtitle={formatDayInZone(today, timezone, locale)}
          onPress={() => open(`daily:${today}`)}
        />
      </ListSection>
      <DateTimeField
        label="Buka tanggal lain"
        value={startOfDayInZone(selected, timezone)}
        onChange={(value) => open(`daily:${dayKeyInZone(value, timezone)}`)}
        mode="date"
        timeZone={timezone}
        locale={locale}
      />
      {workspace.isPending ? (
        <ListSkeleton />
      ) : workspace.isError ? (
        <ErrorState
          message={workspace.error.message}
          onRetry={() => void workspace.refetch()}
        />
      ) : !history.length ? (
        <EmptyState title="Belum ada catatan sebelumnya" />
      ) : (
        <ListSection title="Sebelumnya">
          {history.map((entry) => (
            <ListRow
              key={entry.ref}
              title={formatDayInZone(entry.day, timezone, locale)}
              subtitle={entry.excerpt}
              onPress={() => open(entry.ref)}
            />
          ))}
        </ListSection>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg },
});
