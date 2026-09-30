import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CALENDAR_VIEW_LABELS,
  CALENDAR_VIEWS,
  isCalendarView,
  type CalendarView,
} from "./calendar-date";

const STEP_LABELS: Record<CalendarView, { previous: string; next: string }> = {
  day: { previous: "Hari sebelumnya", next: "Hari berikutnya" },
  week: { previous: "Minggu sebelumnya", next: "Minggu berikutnya" },
  month: { previous: "Bulan sebelumnya", next: "Bulan berikutnya" },
  year: { previous: "Tahun sebelumnya", next: "Tahun berikutnya" },
  schedule: { previous: "Rentang sebelumnya", next: "Rentang berikutnya" },
};

export type CalendarToolbarProps = {
  view: CalendarView;
  title: string;
  titleId: string;
  onToday: () => void;
  onStep: (delta: number) => void;
};

export function CalendarToolbar({
  view,
  title,
  titleId,
  onToday,
  onStep,
}: CalendarToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
        <Button variant="dark-outline" size="sm" onClick={onToday}>
          Hari ini
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={STEP_LABELS[view].previous}
          onClick={() => onStep(-1)}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="-ml-2 sm:-ml-3"
          aria-label={STEP_LABELS[view].next}
          onClick={() => onStep(1)}
        >
          <ChevronRight />
        </Button>
        <h2
          id={titleId}
          aria-live="polite"
          className="min-w-0 truncate font-display text-base font-semibold capitalize sm:text-xl"
        >
          {title}
        </h2>
      </div>
    </div>
  );
}

type CalendarViewSelectProps = {
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
};

export function CalendarViewSelect({
  view,
  onViewChange,
}: CalendarViewSelectProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="dark-outline" size="sm" className="h-11 px-3" />
        }
      >
        <span className="sr-only">Tampilan: </span>
        {CALENDAR_VIEW_LABELS[view]}
        <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuRadioGroup
          aria-label="Tampilan kalender"
          value={view}
          onValueChange={(value: unknown) => {
            if (isCalendarView(value)) onViewChange(value);
          }}
        >
          {CALENDAR_VIEWS.map((value) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {CALENDAR_VIEW_LABELS[value]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
