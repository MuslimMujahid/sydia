import { z } from "zod";
import { useAppForm } from "@/lib/hooks/forms";
import {
  FieldShell,
  TextField,
  FormError,
} from "@/components/forms/form-fields";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";
import { PasswordField } from "./password-field";

export type AuthField = {
  name: string;
  label: string;
  type?: "text" | "email" | "password";
  autoComplete?: string;
  placeholder?: string;
  minLength?: number;
};
interface AuthFieldsFormProps {
  fields: AuthField[];
  submitLabel: string;
  pending: boolean;
  error?: string;
  note?: string;
  afterField?: (field: AuthField) => ReactNode;
  beforeSubmit?: ReactNode;
  onSubmit: (values: Record<string, string>) => Promise<void>;
}

export function AuthFieldsForm({
  fields,
  submitLabel,
  pending,
  error,
  note,
  afterField,
  beforeSubmit,
  onSubmit,
}: AuthFieldsFormProps) {
  const schema = z.record(z.string(), z.string()).superRefine((values, ctx) => {
    for (const field of fields) {
      const value = values[field.name] ?? "";
      if (!value || (field.minLength && value.length < field.minLength))
        ctx.addIssue({
          code: "custom",
          path: [field.name],
          message: field.minLength
            ? `Gunakan minimal ${field.minLength} karakter.`
            : "Lengkapi kolom ini.",
        });
      if (field.type === "email" && !z.email().safeParse(value).success)
        ctx.addIssue({
          code: "custom",
          path: [field.name],
          message: "Masukkan alamat email yang valid.",
        });
    }

    if (
      "confirmPassword" in values &&
      values.password !== values.confirmPassword
    )
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Kata sandi belum cocok.",
      });
  });

  const form = useAppForm({
    defaultValues: Object.fromEntries(fields.map((field) => [field.name, ""])),
    validators: { onChange: schema },
    onSubmit: async ({ value }) => onSubmit(value),
  });

  return (
    <form
      method="post"
      className="space-y-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className={afterField ? "space-y-4" : "space-y-5"}>
        {fields.map((item) => (
          <form.Field key={item.name} name={item.name}>
            {(field) => (
              <FieldShell
                id={item.name}
                label={item.label}
                errors={field.state.meta.errors}
              >
                {({ describedBy, invalid }) => (
                  <>
                    {item.type === "password" ? (
                      <PasswordField
                        id={item.name}
                        name={item.name}
                        autoComplete={item.autoComplete}
                        placeholder={item.placeholder}
                        value={field.state.value}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                        onBlur={field.handleBlur}
                        aria-invalid={invalid}
                        aria-describedby={describedBy}
                        disabled={pending}
                      />
                    ) : (
                      <TextField
                        id={item.name}
                        name={item.name}
                        type={item.type}
                        autoComplete={item.autoComplete}
                        placeholder={item.placeholder}
                        value={field.state.value}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                        onBlur={field.handleBlur}
                        aria-invalid={invalid}
                        aria-describedby={describedBy}
                        disabled={pending}
                        className="h-12"
                      />
                    )}
                    {afterField?.(item)}
                  </>
                )}
              </FieldShell>
            )}
          </form.Field>
        ))}
      </div>
      {note && (
        <p className="-mt-2 mb-[25px]! text-[13px] leading-[19px] text-ink-muted">
          {note}
        </p>
      )}
      {beforeSubmit}
      <FormError message={error} />
      <form.Subscribe
        selector={(state) => [state.canSubmit, state.isSubmitting]}
      >
        {([canSubmit, isSubmitting]) => (
          <Button
            className="h-12 w-full text-white"
            type="submit"
            disabled={!canSubmit || isSubmitting || pending}
          >
            {pending ? "Memproses…" : submitLabel}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
