import { useLocalSearchParams } from "expo-router";
import { FileLibraryScreen } from "@/components/files/file-library-screen";

export default function FolderScreen() {
  const { folderId } = useLocalSearchParams<{ folderId: string }>();

  return <FileLibraryScreen key={folderId} folderId={folderId} />;
}
