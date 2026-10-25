import {
  AlarmClock,
  CalendarDays,
  CheckSquare2,
  FileText,
  Files,
} from "lucide-react";

export const ENTITY_PILL_BASE_CLASS_NAME =
  "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.875em] leading-6 font-medium transition-colors";

export const ENTITY_PILL_STYLES = {
  note: {
    icon: Files,
    color: "bg-brand/8 text-ink hover:bg-brand/15",
    en: "Note",
    id: "Catatan",
  },
  task: {
    icon: CheckSquare2,
    color: "bg-blue-50 text-blue-800 hover:bg-blue-100",
    en: "Task",
    id: "Tugas",
  },
  reminder: {
    icon: AlarmClock,
    color: "bg-amber-50 text-amber-900 hover:bg-amber-100",
    en: "Reminder",
    id: "Pengingat",
  },
  file: {
    icon: FileText,
    color: "bg-violet-50 text-violet-800 hover:bg-violet-100",
    en: "File",
    id: "File",
  },
  event: {
    icon: CalendarDays,
    color: "bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
    en: "Event",
    id: "Acara",
  },
};
