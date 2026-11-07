import { ChevronLeft, ChevronRight, Ellipsis } from "lucide-react";
import { Button } from "@/components/ui/button";

type UsersPaginationProps = {
  offset: number;
  limit: number;
  total: number;
  isFetching: boolean;
  onOffsetChange: (offset: number) => void;
};

function pageNumbers(
  current: number,
  total: number
): Array<number | "start-gap" | "end-gap"> {
  if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1);
  if (current <= 2) return [1, 2, 3, "end-gap", total];
  if (current >= total - 1)
    return [1, "start-gap", total - 2, total - 1, total];

  return [1, "start-gap", current - 1, current, current + 1, "end-gap", total];
}

export function UsersPagination({
  offset,
  limit,
  total,
  isFetching,
  onOffsetChange,
}: UsersPaginationProps) {
  const current = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="flex max-w-full flex-wrap items-center gap-1.5 sm:gap-3">
      <Button
        variant="dark-outline"
        size="icon-sm"
        className="size-8 rounded-[8px] bg-canvas"
        aria-label="Sebelumnya"
        disabled={isFetching || current === 1}
        onClick={() => onOffsetChange(Math.max(0, offset - limit))}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      {pageNumbers(current, pages).map((page) =>
        typeof page === "number" ? (
          <Button
            key={page}
            variant={page === current ? "dark" : "dark-outline"}
            size="icon-sm"
            className="size-8 rounded-[8px] font-mono text-xs tabular-nums"
            aria-label={`Halaman ${page}`}
            aria-current={page === current ? "page" : undefined}
            disabled={isFetching || total === 0}
            onClick={() => onOffsetChange((page - 1) * limit)}
          >
            {page}
          </Button>
        ) : (
          <span
            key={page}
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center text-ink-muted"
          >
            <Ellipsis className="size-4" />
          </span>
        )
      )}
      <Button
        variant="dark-outline"
        size="icon-sm"
        className="size-8 rounded-[8px] bg-canvas"
        aria-label="Berikutnya"
        disabled={isFetching || current >= pages}
        onClick={() => onOffsetChange(offset + limit)}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  );
}
