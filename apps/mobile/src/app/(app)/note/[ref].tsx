import { useQuery } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams } from "expo-router";
import { NoteDetail } from "@/components/notes/note-detail";
import { validNoteRef } from "@/components/notes/workspace-model";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { workspaceNoteQueryOptions } from "@/lib/services/api/notes/notes.api";

export default function NoteScreen() {
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const valid = typeof ref === "string" && validNoteRef(ref);
  const note = useQuery({ ...workspaceNoteQueryOptions(ref), enabled: valid });

  if (!valid) return <ErrorState message="Alamat catatan tidak valid." />;
  if (note.isPending) return <LoadingState label="Memuat catatan…" />;
  if (!note.data && note.isError)
    return (
      <ErrorState
        title="Catatan tidak dapat dibuka"
        message={note.error.message}
        onRetry={() => void note.refetch()}
      />
    );
  if (note.data?.format === "record")
    return (
      <Redirect
        href={{ pathname: "/record/[id]", params: { id: ref.slice(7) } }}
      />
    );

  return note.data ? <NoteDetail key={ref} note={note.data} /> : null;
}
