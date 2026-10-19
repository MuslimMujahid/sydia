import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { TextField } from "@/components/forms/form-fields";

export function PasswordField(props: ComponentProps<typeof TextField>) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <TextField
        {...props}
        type={visible ? "text" : "password"}
        className="h-12 pr-12"
      />
      <button
        type="button"
        className="absolute inset-y-0 right-1 inline-flex w-11 items-center justify-center rounded-sm text-ink-muted outline-none focus-visible:outline-2 focus-visible:outline-brand/50"
        aria-label={visible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
        aria-pressed={visible}
        disabled={props.disabled}
        onClick={() => setVisible((value) => !value)}
      >
        {visible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}
