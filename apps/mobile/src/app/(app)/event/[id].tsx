import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CalendarEventDetail } from "@/components/calendar/calendar-event-detail";
import { calendarEventDetailQueryOptions } from "@/components/calendar/event-detail-query";
import { ErrorState, LoadingState } from "@/components/ui/states";

export default function EventDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
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
    <CalendarEventDetail
      event={query.data}
      routeId={id}
      onDeleted={() =>
        router.canGoBack() ? router.back() : router.replace("/calendar")
      }
    />
  );
}
