import { Link } from "@tanstack/react-router";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import type { DragEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { LibraryCrumb } from "@/lib/services/api/file-library/file-library.api";
import { cn } from "@/lib/utils/cn";

interface FileLibraryBreadcrumbsProps {
  path: LibraryCrumb[];
  dropTarget: string | null;
  canDrop: (id: string | null, ancestors: LibraryCrumb[]) => boolean;
  onTarget: (id: string) => void;
  onDrop: (
    event: DragEvent,
    id: string | null,
    ancestors: LibraryCrumb[]
  ) => void;
}

export function FileLibraryBreadcrumbs({
  path,
  dropTarget,
  canDrop,
  onTarget,
  onDrop,
}: FileLibraryBreadcrumbsProps) {
  const hidden = path.slice(0, -2);
  const visible = path.slice(-2);

  return (
    <nav
      aria-label="Lokasi file"
      className="flex min-w-0 items-center gap-1 text-sm sm:gap-2"
    >
      <Link
        to="/files"
        search={{}}
        className={cn(
          "shrink-0 rounded-sm px-1 py-2 underline-offset-4 hover:underline",
          dropTarget === "root" && "bg-brand/10"
        )}
        onDragOver={(event) => {
          if (canDrop(null, [])) {
            event.preventDefault();
            onTarget("root");
          }
        }}
        onDrop={(event) => onDrop(event, null, [])}
      >
        File saya
      </Link>
      {hidden.length ? (
        <>
          <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Folder induk lainnya"
                />
              }
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-h-64 overflow-y-auto">
              {hidden.map((crumb) => (
                <DropdownMenuItem
                  key={crumb.id}
                  render={<Link to="/files" search={{ folder: crumb.id }} />}
                >
                  {crumb.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : null}
      {visible.map((crumb) => {
        const index = path.findIndex((ancestor) => ancestor.id === crumb.id);
        const ancestors = path.slice(0, index);

        return (
          <span
            key={crumb.id}
            className="flex min-w-0 items-center gap-1 sm:gap-2"
          >
            <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
            <Link
              to="/files"
              search={{ folder: crumb.id }}
              className={cn(
                "min-w-0 max-w-48 truncate rounded-sm px-1 py-2 underline-offset-4 hover:underline",
                dropTarget === crumb.id && "bg-brand/10"
              )}
              title={crumb.name}
              aria-current={index === path.length - 1 ? "page" : undefined}
              onDragOver={(event) => {
                if (canDrop(crumb.id, ancestors)) {
                  event.preventDefault();
                  onTarget(crumb.id);
                }
              }}
              onDrop={(event) => onDrop(event, crumb.id, ancestors)}
            >
              {crumb.name}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}
