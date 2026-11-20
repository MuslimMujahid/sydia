import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CalendarEventEditor } from "@/components/calendar/calendar-event-editor";
import { calendarEventDetailQueryOptions } from "@/components/calendar/event-detail-query";
import { ErrorState, LoadingState } from "@/components/ui/states";

export default function EditEventScreen() {
  const router = useRouter();
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const query = useQuery(calendarEventDetailQueryOptions(id));

  if (query.isPending) return <LoadingState label="Memuat acara…" />;
  if (!query.data)
    return (
      <ErrorState
        title="Acara tidak dapat dimuat"
        message={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );

  return (
    <CalendarEventEditor
      key={query.data.id}
      event={query.data}
      onCancel={() =>
        router.canGoBack() ? router.back() : router.replace("/calendar")
      }
      onSaved={(event) => {
        if (from && router.canGoBack()) {
          router.back();
          if (from === event.id) return;
        }
        router.replace({ pathname: "/event/[id]", params: { id: event.id } });
      }}
    />
  );
}
