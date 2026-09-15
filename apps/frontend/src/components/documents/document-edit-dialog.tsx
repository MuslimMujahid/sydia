import { LoaderCircle } from "lucide-react";
import { z } from "zod";
import {
  FieldShell,
  FormError,
  TextField,
} from "@/components/forms/form-fields";
import {
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAppForm } from "@/lib/hooks/forms";
import type { Document } from "@/lib/services/api/documents/documents.api";
import { useUpdateDocument } from "@/lib/services/api/documents/documents.queries";
import { Button } from "@/components/ui/button";

const documentEditSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Masukkan nama file.")
    .max(120, "Nama file maksimal 120 karakter."),
  description: z.string().trim().max(1000, "Deskripsi maksimal 1000 karakter."),
});

type DocumentEditDialogProps = {
  document: Document;
  onClose: () => void;
  onPendingChange?: (pending: boolean) => void;
};

export function DocumentEditDialog({
  document,
  onClose,
  onPendingChange,
}: DocumentEditDialogProps) {
  const mutation = useUpdateDocument();
  const form = useAppForm({
    defaultValues: {
      title: document.title,
      description: document.description ?? "",
    },
    validators: { onChange: documentEditSchema },
    onSubmit: async ({ value }) => {
      const title = value.title.trim();
      const description = value.description.trim();
      const currentTitle = document.title.trim();
      const currentDescription = document.description?.trim() ?? "";

      if (title === currentTitle && description === currentDescription) {
        onClose();

        return;
      }

      onPendingChange?.(true);

      try {
        await mutation.mutateAsync({
          documentId: document.id,
          values: {
            title,
            description: description === "" ? null : description,
          },
        });
        onClose();
      } finally {
        onPendingChange?.(false);
      }
    },
  });

  return (
    <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
      <DialogTitle>Edit file</DialogTitle>
      <DialogDescription className="mt-2">
        Perbarui nama file “{document.title}”.
      </DialogDescription>
      <form
        className="mt-7 space-y-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          mutation.reset();
          void form.handleSubmit();
        }}
      >
        <form.Field name="title">
          {(field) => (
            <FieldShell
              id="document-title"
              label="Nama file"
              errors={field.state.meta.errors}
            >
              {({ describedBy, invalid }) => (
                <TextField
                  id="document-title"
                  autoFocus
                  maxLength={120}
                  value={field.state.value}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              )}
            </FieldShell>
          )}
        </form.Field>
        <form.Field name="description">
          {(field) => (
            <FieldShell
              id="document-description"
              label="Deskripsi"
              description="Opsional. Tambahkan keterangan singkat tentang file ini."
              errors={field.state.meta.errors}
            >
              {({ describedBy, invalid }) => (
                <Textarea
                  id="document-description"
                  maxLength={1000}
                  value={field.state.value}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              )}
            </FieldShell>
          )}
        </form.Field>
        <FormError message={mutation.error?.message} />
        <div className="flex justify-end gap-3 border-t border-surface-1 pt-5">
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button
                type="button"
                variant="dark-outline"
                disabled={isSubmitting}
                onClick={onClose}
              >
                Batal
              </Button>
            )}
          </form.Subscribe>
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
          >
            {([canSubmit, isSubmitting]) => (
              <Button type="submit" disabled={!canSubmit || isSubmitting}>
                {isSubmitting ? (
                  <LoaderCircle className="animate-spin motion-reduce:animate-none" />
                ) : null}
                {isSubmitting ? "Menyimpan…" : "Simpan perubahan"}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </form>
    </DialogContent>
  );
}
