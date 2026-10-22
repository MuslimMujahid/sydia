import { Children, type ReactNode } from "react";
import { Switch } from "@/components/ui/switch";

interface IntegrationRowProps {
  id: string;
  title: string;
  account?: string | null;
  logoSrc?: string;
  description?: ReactNode;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
  children?: ReactNode;
}

export function IntegrationRow({
  id,
  title,
  account,
  logoSrc,
  description,
  checked,
  disabled,
  onCheckedChange,
  children,
}: IntegrationRowProps) {
  const footer = Children.toArray(children);

  return (
    <section
      className="py-4 first:pt-0 last:pb-0"
      aria-labelledby={`${id}-title`}
    >
      <div className="flex items-start justify-between gap-6">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          {logoSrc ? (
            <img
              src={logoSrc}
              alt=""
              aria-hidden="true"
              width={28}
              height={28}
              className="size-7 shrink-0 object-contain"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <h3
              id={`${id}-title`}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm font-semibold text-ink"
            >
              <label htmlFor={id}>{title}</label>
              {account ? (
                <span className="min-w-0 text-sm font-normal text-ink-muted break-all">
                  {" "}
                  {account}
                </span>
              ) : null}
            </h3>
            {description ? (
              <div
                id={`${id}-description`}
                className="mt-1 text-[13px] leading-5 text-ink-muted break-words"
              >
                {description}
              </div>
            ) : null}
          </div>
        </div>
        <Switch
          id={id}
          aria-describedby={description ? `${id}-description` : undefined}
          checked={checked}
          disabled={disabled}
          onCheckedChange={onCheckedChange}
          className="mt-0.5"
        />
      </div>
      {footer.length > 0 ? (
        <div className="mt-3 space-y-3">{footer}</div>
      ) : null}
    </section>
  );
}
