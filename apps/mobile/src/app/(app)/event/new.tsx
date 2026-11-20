import { useLocalSearchParams, useRouter } from "expo-router";
import { isDayKey } from "@/components/calendar/calendar-date";
import { CalendarEventEditor } from "@/components/calendar/calendar-event-editor";

export default function NewEventScreen() {
  const router = useRouter();
  const { day } = useLocalSearchParams<{ day?: string }>();

  return (
    <CalendarEventEditor
      day={isDayKey(day) ? day : undefined}
      onCancel={() =>
        router.canGoBack() ? router.back() : router.replace("/calendar")
      }
      onSaved={(event) =>
        router.replace({ pathname: "/event/[id]", params: { id: event.id } })
      }
    />
  );
}
