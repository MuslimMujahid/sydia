import { useRouter } from "expo-router";
import { ReminderEditor } from "@/components/reminders/reminder-editor";

export default function NewReminderScreen() {
  const router = useRouter();

  return (
    <ReminderEditor
      onClose={() =>
        router.canGoBack() ? router.back() : router.replace("/reminders")
      }
    />
  );
}
