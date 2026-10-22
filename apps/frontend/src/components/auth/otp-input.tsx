import { useState } from "react";
import { cn } from "@/lib/utils/cn";

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  showExpiryHint?: boolean;
}

export function OtpInput({
  value,
  onChange,
  disabled,
  invalid,
  showExpiryHint = true,
}: OtpInputProps) {
  const [focused, setFocused] = useState(false);
  const [position, setPosition] = useState(0);

  return (
    <div className="space-y-2">
      <label
        htmlFor="verification-code"
        className="block text-sm leading-[22px] font-semibold"
      >
        Kode verifikasi
      </label>
      <div className="relative">
        <div aria-hidden="true" className="flex gap-2">
          {Array.from({ length: 6 }, (_, index) => (
            <span
              key={index}
              className={cn(
                "flex h-[60px] min-w-0 flex-1 items-center justify-center rounded-sm border border-ink/16 bg-white text-[24px] font-semibold",
                invalid && "border-destructive",
                focused &&
                  index === position &&
                  "border-brand ring-1 ring-brand"
              )}
            >
              {value[index] ||
                (focused && index === position ? (
                  <span className="h-6 w-px bg-ink" />
                ) : null)}
            </span>
          ))}
        </div>
        <input
          id="verification-code"
          name="otp"
          className="absolute inset-0 h-full w-full cursor-text opacity-0 disabled:cursor-not-allowed"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus={!invalid}
          pattern="[0-9]{6}"
          maxLength={6}
          value={value}
          disabled={disabled}
          aria-invalid={invalid}
          aria-describedby="code-help"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSelect={(event) =>
            setPosition(Math.min(event.currentTarget.selectionStart ?? 0, 5))
          }
          onPaste={(event) => {
            // Normalize before the browser's maxlength truncates separators.
            const digits = event.clipboardData
              .getData("text")
              .replace(/\D/g, "")
              .slice(0, 6);

            event.preventDefault();
            onChange(digits);
            setPosition(Math.min(digits.length, 5));
          }}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, "").slice(0, 6);
            onChange(digits);
            setPosition(Math.min(digits.length, 5));
          }}
        />
      </div>
      <p
        id="code-help"
        className={
          showExpiryHint
            ? "pt-2 text-[13px] leading-[19px] text-ink-muted"
            : "sr-only"
        }
      >
        Kode berlaku selama 10 menit.
      </p>
    </div>
  );
}
