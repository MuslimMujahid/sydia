import { useLocalSearchParams, useRouter } from "expo-router";
import { isDayKey } from "@/components/calendar/calendar-date";
import { TaskEditor } from "@/components/tasks/task-editor";

export default function NewTaskScreen() {
  const router = useRouter();
  const { dueDate } = useLocalSearchParams<{ dueDate?: string }>();

  return (
    <TaskEditor
      initialDueDate={isDayKey(dueDate) ? dueDate : undefined}
      onClose={() =>
        router.canGoBack() ? router.back() : router.replace("/tasks")
      }
    />
  );
}
