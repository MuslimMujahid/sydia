import type { ComponentProps, InputHTMLAttributes, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

type FieldShellProps = {
  id: string;
  label: string;
  description?: string;
  errors?: unknown[];
  children: (props: {
    describedBy?: string;
    invalid: boolean;
  }) => React.ReactNode;
};

/** Readable messages from TanStack Form field errors (strings or zod issues). */
export function fieldErrorMessages(errors: unknown[]): string[] {
  return errors.map((error) => {
    if (typeof error === "string") return error;
    if (error instanceof Error) return error.message;

    // TanStack Form surfaces standard-schema (zod) issues as objects carrying
    // their own `message`; without this the user sees only the fallback copy.
    if (
      error !== null &&
      typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string" &&
      error.message
    )
      return error.message;

    return "Periksa nilai ini.";
  });
}

export function FieldShell({
  id,
  label,
  description,
  errors = [],
  children,
}: FieldShellProps) {
  const messages = fieldErrorMessages(errors);
  const invalid = messages.length > 0;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = invalid ? `${id}-error` : undefined;
  const describedBy =
    [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-2">
      <label
        className="block font-sans text-sm font-semibold text-ink"
        htmlFor={id}
      >
        {label}
      </label>
      {children({ describedBy, invalid })}
      {description ? (
        <p id={descriptionId} className="text-sm text-ink-muted">
          {description}
        </p>
      ) : null}
      {invalid ? (
        <p id={errorId} className="text-sm text-destructive" role="alert">
          {messages.join(" ")}
        </p>
      ) : null}
    </div>
  );
}

export function TextField(props: InputHTMLAttributes<HTMLInputElement>) {
  return <Input {...props} />;
}

export type SelectOption<T extends string> = {
  value: T;
  label: string;
};

type SelectFieldProps<T extends string> = Omit<
  ComponentProps<"button">,
  "value" | "onChange" | "children"
> & {
  value: T;
  options: readonly SelectOption<T>[];
  onValueChange: (value: T) => void;
  /** Optional leading icon rendered inside the trigger. */
  icon?: ReactNode;
  contentClassName?: string;
};

/** Single-value picker built on the shared dropdown menu. */
export function SelectField<T extends string>({
  value,
  options,
  onValueChange,
  icon,
  className,
  contentClassName,
  ...props
}: SelectFieldProps<T>) {
  const selected = options.find((option) => option.value === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        data-slot="select-field"
        className={cn(
          "flex h-11 w-full items-center gap-2 rounded-sm border border-ink/16 bg-canvas px-3 text-left text-[15px] text-ink outline-none hover:border-brand/50 focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-brand/15 disabled:cursor-default disabled:bg-ink/4 disabled:opacity-40 aria-invalid:border-destructive data-[popup-open]:border-brand [&_svg]:size-4 [&_svg]:shrink-0",
          className
        )}
        {...props}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">
          {selected?.label ?? value}
        </span>
        <ChevronDown className="text-ink-muted" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className={cn(
          "max-h-[min(20rem,var(--available-height))] min-w-[var(--anchor-width)] overflow-y-auto",
          contentClassName
        )}
      >
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next: T) => onValueChange(next)}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              closeOnClick
            >
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FormError({ message }: { message?: string | null }) {
  return message ? (
    <div
      className="border-l-2 border-destructive bg-destructive/5 px-4 py-3 text-sm text-ink"
      role="alert"
    >
      {message}
    </div>
  ) : null;
}
