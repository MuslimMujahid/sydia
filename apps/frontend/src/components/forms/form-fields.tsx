import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";
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

export function FieldShell({
  id,
  label,
  description,
  errors = [],
  children,
}: FieldShellProps) {
  const messages = errors.map((error) =>
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "Check this value."
  );

  const invalid = messages.length > 0;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = invalid ? `${id}-error` : undefined;
  const describedBy =
    [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-2">
      <label
        className="block font-display text-sm font-semibold text-ink"
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

export function SelectField({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-sm border border-hairline bg-canvas px-3 text-base text-ink outline-none transition-colors hover:border-ink-weak focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/30 disabled:opacity-50 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
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
