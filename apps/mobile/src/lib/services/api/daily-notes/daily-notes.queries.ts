import {
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  deleteDailyNote,
  getDailyNote,
  getDailyNotes,
  upsertDailyNote,
  type DailyNote,
  type DailyNoteRange,
} from "./daily-notes.api";

export const dailyNoteQueryKeys = {
  all: ["daily-notes"] as const,
  lists: () => ["daily-notes", "list"] as const,
  list: (range: DailyNoteRange) => ["daily-notes", "list", range] as const,
  details: () => ["daily-notes", "detail"] as const,
  detail: (date: string) => ["daily-notes", "detail", date] as const,
};

export const dailyNotesQueryOptions = (range: DailyNoteRange) =>
  queryOptions({
    queryKey: dailyNoteQueryKeys.list(range),
    queryFn: () => getDailyNotes(range),
    staleTime: 15_000,
  });

export const dailyNoteQueryOptions = (date: string) =>
  queryOptions({
    queryKey: dailyNoteQueryKeys.detail(date),
    queryFn: () => getDailyNote(date),
    enabled: Boolean(date),
  });

function cacheDailyNote(
  queryClient: QueryClient,
  date: string,
  dailyNote: DailyNote | null
) {
  queryClient.setQueryData(dailyNoteQueryKeys.detail(date), dailyNote);
}

export function useUpsertDailyNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: upsertDailyNote,
    onSuccess: (dailyNote, variables) =>
      cacheDailyNote(queryClient, variables.date, dailyNote),
    meta: { invalidateQueries: [dailyNoteQueryKeys.all] },
  });
}

export function useDeleteDailyNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteDailyNote,
    onSuccess: (_, date) => {
      queryClient.setQueryData(dailyNoteQueryKeys.detail(date), null);
    },
    meta: { invalidateQueries: [dailyNoteQueryKeys.all] },
  });
}
