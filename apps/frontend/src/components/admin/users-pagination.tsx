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
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "end-gap", total];
  if (current >= total - 3)
    return [1, "start-gap", total - 4, total - 3, total - 2, total - 1, total];

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
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-9"
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
            variant={page === current ? "dark" : "ghost"}
            size="icon-sm"
            className="size-9 tabular-nums"
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
            className="flex size-9 shrink-0 items-center justify-center text-ink-muted"
          >
            <Ellipsis className="size-4" />
          </span>
        )
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-9"
        aria-label="Berikutnya"
        disabled={isFetching || current >= pages}
        onClick={() => onOffsetChange(offset + limit)}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  );
}
