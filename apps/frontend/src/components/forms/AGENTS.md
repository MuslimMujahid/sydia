# Forms (TanStack Form + Zod)

Use `@tanstack/react-form` for field state and submission, and Zod for typed validation. Interactive forms are ordinary React components in TanStack Start; do not add framework-specific client directives to them.

## Conventions

- Keep a form in a focused component (for example, `src/components/forms/contact-form.tsx`) and expose a small API such as `onSubmit(values)` rather than passing the whole `FormApi` to callers.
- Name schemas `xyzSchema` and infer input types as `XyzInput` with `z.infer<typeof xyzSchema>`.
- Prefer the shared `useAppForm` from `src/lib/hooks/forms/forms.ts` when it fits. Its contexts are defined in `form-context.ts`; custom field components can be registered there when the project gains reusable fields. The current hook has no registered field components, so use `form.Field` directly unless a registered component exists.
- Use controlled values through TanStack Form's `Field` render prop. Display `field.state.meta.errors`, submit state, and server errors deliberately.
- Keep labels, descriptions, and errors connected with stable `id`/`htmlFor` and `aria-describedby`; set `aria-invalid` when validation fails.

## Example

```tsx
import { z } from "zod";
import { useAppForm } from "@/lib/hooks/forms";
import { Button } from "@/components/ui/button";

export const contactSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.email("Enter a valid email"),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

export type ContactInput = z.infer<typeof contactSchema>;

type ContactFormProps = {
  onSubmit?: (values: ContactInput) => Promise<void> | void;
};

export function ContactForm({ onSubmit }: ContactFormProps) {
  const form = useAppForm({
    defaultValues: { name: "", email: "", message: "" } as ContactInput,
    validators: { onChange: contactSchema },
    onSubmit: async ({ value }) => {
      await onSubmit?.(value);
    },
  });

  return (
    <form
      className="space-y-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="name">
        {(field) => {
          const errorId = `${field.name}-error`;
          const hasError = field.state.meta.errors.length > 0;
          return (
            <div className="space-y-2">
              <label htmlFor={field.name}>Name</label>
              <input
                id={field.name}
                name={field.name}
                value={field.state.value}
                aria-invalid={hasError}
                aria-describedby={hasError ? errorId : undefined}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              {hasError ? <p id={errorId} role="alert">{field.state.meta.errors.join(", ")}</p> : null}
            </div>
          );
        }}
      </form.Field>

      <form.Field name="email">
        {(field) => (
          <label>
            Email
            <input
              id={field.name}
              name={field.name}
              type="email"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </label>
        )}
      </form.Field>

      <form.Field name="message">
        {(field) => (
          <label>
            Message
            <textarea
              id={field.name}
              name={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </label>
        )}
      </form.Field>

      <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
        {([canSubmit, isSubmitting]) => (
          <Button type="submit" disabled={!canSubmit}>
            {isSubmitting ? "Sending…" : "Send"}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
```

## Validation and integration

- Prefer form-level Zod validators through `validators` for the complete value. Use `z.object(...).refine(...)` or `.superRefine(...)` for cross-field constraints such as matching passwords.
- Keep server submission outside the field components. A route or parent can pass an async `onSubmit`; API requests belong under `src/lib/services/api` and should surface a typed, user-readable error.
- Keep defaults complete and typed. Do not use `any` to work around field inference. Use `form.Subscribe` for reactive submit state rather than reading changing form state during unrelated renders.
- Prefer an existing Base UI/shadcn input primitive when one exists, while preserving the field's label, focus, keyboard, and error behavior.
