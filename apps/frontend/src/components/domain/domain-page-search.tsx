import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { TopbarPortal } from "@/components/dashboard/topbar-slots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

export type DomainPageSearchProps = {
  /** Accessible name, e.g. “Cari tugas”. */
  label: string;
  placeholder: string;
  /** The search draft; pages apply it in `onSubmit`. */
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  /** Clears both the draft and the applied search. */
  onClear: () => void;
  /** Classes for the in-page field shown from `lg`. */
  className?: string;
};

type SearchFieldProps = Omit<DomainPageSearchProps, "className">;

// Browsers draw their own clear control on search inputs; ours replaces it.
const HIDE_NATIVE_CANCEL =
  "[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none";

/**
 * A page search that sits in the page from `lg` and, below `lg`, collapses to
 * an icon in the shell's app bar that expands into a field when tapped.
 */
export function DomainPageSearch({
  className,
  ...props
}: DomainPageSearchProps) {
  return (
    <>
      <InlineSearch {...props} className={cn("max-lg:hidden", className)} />
      <TopbarPortal slot="search">
        <TopbarSearch {...props} />
      </TopbarPortal>
    </>
  );
}

function InlineSearch({
  label,
  placeholder,
  value,
  onValueChange,
  onSubmit,
  onClear,
  className,
}: DomainPageSearchProps) {
  const inputId = useId();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form
      className={cn("relative min-w-0", className)}
      role="search"
      onSubmit={handleSubmit}
    >
      <label className="sr-only" htmlFor={inputId}>
        {label}
      </label>
      <Input
        id={inputId}
        type="search"
        enterKeyHint="search"
        placeholder={placeholder}
        className="pr-12"
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value);
          // Clearing the field (including the native ✕) resets results.
          if (!event.target.value) onClear();
        }}
      />
      <Button
        type="submit"
        variant="ghost"
        size="icon-sm"
        className="absolute top-0.5 right-0.5 px-0"
        aria-label={label}
      >
        <Search />
      </Button>
    </form>
  );
}

function TopbarSearch({
  label,
  placeholder,
  value,
  onValueChange,
  onSubmit,
  onClear,
}: SearchFieldProps) {
  const inputId = useId();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  // An applied or drafted query keeps the field open so it stays visible.
  const expanded = open || value !== "";

  useEffect(() => {
    if (expanded || !restoreFocus.current) return;
    restoreFocus.current = false;
    toggleRef.current?.focus();
  }, [expanded]);

  function openField() {
    // Commit the open state synchronously so the field is focusable within
    // the tap, which lets mobile browsers raise the keyboard.
    flushSync(() => setOpen(true));
    inputRef.current?.focus();
  }

  function close() {
    restoreFocus.current = true;
    setOpen(false);
    if (value) onClear();
  }

  return (
    <>
      <Button
        ref={toggleRef}
        type="button"
        variant="ghost"
        size="icon"
        aria-label={label}
        aria-expanded={expanded}
        aria-controls={formId}
        tabIndex={expanded ? -1 : undefined}
        onClick={openField}
      >
        <Search className="size-5" />
      </Button>
      {/*
        Stays mounted so it can animate both ways. It is positioned against
        the shell's app bar and covers everything right of the menu button;
        when closed it is clipped down to the search icon it grows out of.
      */}
      <form
        id={formId}
        role="search"
        inert={!expanded}
        className={cn(
          "absolute inset-y-0 right-4 left-16 z-10 flex items-center gap-1 bg-canvas transition-[clip-path,opacity] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
          expanded
            ? "opacity-100 [clip-path:inset(0_0_0_0_round_0px)]"
            : "pointer-events-none opacity-0 [clip-path:inset(0.625rem_3.75rem_0.625rem_calc(100%_-_6.5rem)_round_9999px)]"
        )}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
          // Dismiss the on-screen keyboard so the results are visible.
          inputRef.current?.blur();
        }}
        onBlur={(event) => {
          const next = event.relatedTarget;
          if (next instanceof Node && event.currentTarget.contains(next))
            return;
          if (!value) setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          close();
        }}
      >
        <Search
          aria-hidden="true"
          className="ml-1 size-5 shrink-0 text-ink-muted"
        />
        <label className="sr-only" htmlFor={inputId}>
          {label}
        </label>
        <Input
          ref={inputRef}
          id={inputId}
          type="search"
          enterKeyHint="search"
          placeholder={placeholder}
          // Borderless: the app bar itself is the field. 16px text keeps iOS
          // from zooming in on focus.
          className={cn(
            "h-11 min-w-0 flex-1 rounded-none border-0 bg-transparent px-2 text-base hover:border-0 focus-visible:border-0 focus-visible:ring-0",
            HIDE_NATIVE_CANCEL
          )}
          value={value}
          onChange={(event) => {
            onValueChange(event.target.value);
            if (!event.target.value) onClear();
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label="Tutup pencarian"
          onClick={close}
        >
          <X className="size-5" />
        </Button>
      </form>
    </>
  );
}
