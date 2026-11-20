import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { TaskEditor } from "@/components/tasks/task-editor";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { taskQueryOptions } from "@/lib/services/api/tasks/tasks.queries";

export default function TaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const query = useQuery(taskQueryOptions(id));

  if (query.isPending) return <LoadingState label="Memuat tugas…" />;
  if (!query.data)
    return (
      <ErrorState
        title="Tugas tidak dapat dimuat"
        message={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );

  return (
    <TaskEditor
      key={query.data.id}
      task={query.data}
      onClose={() =>
        router.canGoBack() ? router.back() : router.replace("/tasks")
      }
    />
  );
}
