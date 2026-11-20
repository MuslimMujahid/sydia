import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ReminderEditor } from "@/components/reminders/reminder-editor";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { reminderQueryOptions } from "@/lib/services/api/reminders/reminders.queries";

export default function ReminderScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery(reminderQueryOptions(id));

  if (query.isPending) return <LoadingState label="Memuat pengingat…" />;
  if (!query.data)
    return (
      <ErrorState
        title="Pengingat tidak dapat dimuat"
        message={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );

  return (
    <ReminderEditor
      key={query.data.id}
      reminder={query.data}
      onClose={() =>
        router.canGoBack() ? router.back() : router.replace("/reminders")
      }
    />
  );
}
