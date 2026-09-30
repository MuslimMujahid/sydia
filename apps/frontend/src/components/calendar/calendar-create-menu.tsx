import { CalendarDays, CheckSquare2 } from "lucide-react";
import { useRef, type ReactElement } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ScheduleItemKind } from "./schedule-items";

type CalendarCreateMenuProps = {
  children: ReactElement;
  onCreate: (kind: ScheduleItemKind) => void;
};

/** Choose an item type before opening its editor. */
export function CalendarCreateMenu({
  children,
  onCreate,
}: CalendarCreateMenuProps) {
  const creatingRef = useRef(false);

  function create(kind: ScheduleItemKind) {
    creatingRef.current = true;
    onCreate(kind);
  }

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) creatingRef.current = false;
      }}
    >
      <DropdownMenuTrigger render={children} />
      <DropdownMenuContent align="end" finalFocus={() => !creatingRef.current}>
        <DropdownMenuItem onClick={() => create("event")}>
          <CalendarDays /> Buat Acara
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => create("task")}>
          <CheckSquare2 /> Buat Tugas
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
