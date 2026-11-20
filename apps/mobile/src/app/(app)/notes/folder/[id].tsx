import { useLocalSearchParams } from "expo-router";
import { NotesWorkspace } from "@/components/notes/notes-workspace";

export default function NotesFolderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <NotesWorkspace key={id} folderId={id} />;
}
