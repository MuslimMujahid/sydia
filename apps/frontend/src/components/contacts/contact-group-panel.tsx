import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { z } from "zod";
import { EmptyState } from "@/components/app-states";
import {
  DomainInlineError,
  DomainListSkeleton,
} from "@/components/domain/domain-page";
import {
  FieldShell,
  FormError,
  TextField,
} from "@/components/forms/form-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppForm } from "@/lib/hooks/forms";
import type { ContactGroup } from "@/lib/services/api/contact-groups/contact-groups.api";
import {
  contactGroupsQueryOptions,
  useCreateContactGroup,
  useDeleteContactGroup,
  useUpdateContactGroup,
} from "@/lib/services/api/contact-groups/contact-groups.queries";

const contactGroupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Masukkan nama grup.")
    .max(40, "Nama grup maksimal 40 karakter."),
});

type ContactGroupEditorProps = {
  group?: ContactGroup;
  onClose: () => void;
};

function ContactGroupEditor({ group, onClose }: ContactGroupEditorProps) {
  const createMutation = useCreateContactGroup();
  const updateMutation = useUpdateContactGroup();
  const mutation = group ? updateMutation : createMutation;
  const form = useAppForm({
    defaultValues: { name: group?.name ?? "" },
    validators: { onChange: contactGroupSchema },
    onSubmit: async ({ value }) => {
      const values = { name: value.name.trim() };

      if (group)
        await updateMutation.mutateAsync({
          contactGroupId: group.id,
          values,
        });
      else await createMutation.mutateAsync(values);
      onClose();
    },
  });

  return (
    <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
      <DialogTitle>{group ? "Edit grup" : "Grup baru"}</DialogTitle>
      <DialogDescription className="mt-2">
        {group
          ? `Perbarui nama grup “${group.name}”.`
          : "Buat grup baru untuk mengelompokkan kontak."}
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
        <form.Field name="name">
          {(field) => (
            <FieldShell
              id="contact-group-name"
              label="Nama grup"
              errors={field.state.meta.errors}
            >
              {({ describedBy, invalid }) => (
                <TextField
                  id="contact-group-name"
                  autoFocus
                  maxLength={40}
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
          <Button type="button" variant="dark-outline" onClick={onClose}>
            Batal
          </Button>
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
          >
            {([canSubmit, isSubmitting]) => (
              <Button type="submit" disabled={!canSubmit || isSubmitting}>
                {isSubmitting ? (
                  <LoaderCircle className="animate-spin motion-reduce:animate-none" />
                ) : null}
                {isSubmitting ? "Menyimpan…" : "Simpan grup"}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </form>
    </DialogContent>
  );
}

type ContactGroupPanelProps = {
  editingGroup: ContactGroup | "new" | null;
  onEditingGroupChange: (group: ContactGroup | "new" | null) => void;
  onShowMembers: (group: ContactGroup) => void;
};

export function ContactGroupPanel({
  editingGroup,
  onEditingGroupChange,
  onShowMembers,
}: ContactGroupPanelProps) {
  const groupsQuery = useQuery(contactGroupsQueryOptions());
  const deleteMutation = useDeleteContactGroup();

  async function handleDelete(group: ContactGroup) {
    if (
      !window.confirm(
        `Hapus grup “${group.name}”? Kontak di dalamnya tidak akan dihapus.`
      )
    )
      return;
    await deleteMutation.mutateAsync(group.id);
  }

  return (
    <>
      {groupsQuery.isPending ? (
        <DomainListSkeleton label="Memuat grup" />
      ) : null}
      {groupsQuery.isError ? (
        <DomainInlineError
          title="Grup tidak dapat dimuat"
          message={groupsQuery.error.message}
          onRetry={() => void groupsQuery.refetch()}
        />
      ) : null}
      {groupsQuery.isSuccess && !groupsQuery.data.length ? (
        <EmptyState
          title="Belum ada grup"
          message="Satu kontak bisa masuk ke beberapa grup. Buat grup seperti Keluarga atau Kantor untuk mengelompokkan kontak."
        />
      ) : null}
      {groupsQuery.isSuccess && groupsQuery.data.length ? (
        <ul className="divide-y divide-surface-1 border-y border-surface-1">
          {groupsQuery.data.map((group) => (
            <li key={group.id} className="flex items-center gap-3 py-4">
              <span className="min-w-0 flex-1 truncate font-display font-bold">
                {group.name}
              </span>
              <button
                type="button"
                className="rounded-pill outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
                aria-label={`Lihat kontak di grup ${group.name}`}
                onClick={() => onShowMembers(group)}
              >
                <Badge dot="brand" className="hover:border-brand/40">
                  {group.contactCount} kontak
                </Badge>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Tindakan untuk ${group.name}`}
                    />
                  }
                >
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEditingGroupChange(group)}>
                    <Pencil /> Edit grup
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void handleDelete(group)}>
                    <Trash2 /> Hapus grup
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      ) : null}
      <FormError message={deleteMutation.error?.message} />
      <Dialog
        open={Boolean(editingGroup)}
        onOpenChange={(open) => !open && onEditingGroupChange(null)}
      >
        {editingGroup ? (
          <ContactGroupEditor
            group={editingGroup === "new" ? undefined : editingGroup}
            onClose={() => onEditingGroupChange(null)}
          />
        ) : null}
      </Dialog>
    </>
  );
}
