import { useLocalSearchParams } from "expo-router";
import { RecordDetail } from "@/components/notes/record-detail";
import { ErrorState } from "@/components/ui/states";

export default function RecordScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id))
    return <ErrorState message="Alamat tabel tidak valid." />;
  return <RecordDetail key={id} id={id} />;
}
