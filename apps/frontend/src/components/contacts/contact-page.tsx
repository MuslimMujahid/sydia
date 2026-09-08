import { useQuery } from "@tanstack/react-query";
import {
  LoaderCircle,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { EmptyState } from "@/components/app-states";
import {
  DomainInlineError,
  DomainListSkeleton,
  DomainPageHeader,
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAppForm } from "@/lib/hooks/forms";
import type {
  Contact,
  ContactWriteInput,
} from "@/lib/services/api/contacts/contacts.api";
import {
  contactsQueryOptions,
  useCreateContact,
  useDeleteContact,
  useUpdateContact,
} from "@/lib/services/api/contacts/contacts.queries";

const contactSchema = z.object({
  name: z.string().trim().min(2, "Masukkan nama minimal 2 karakter."),
  email: z.union([z.literal(""), z.email("Masukkan alamat email yang valid.")]),
  phone: z.string(),
  aliases: z.string(),
  notes: z.string(),
});

type ContactEditorProps = {
  contact?: Contact;
  onClose: () => void;
};

function ContactEditor({ contact, onClose }: ContactEditorProps) {
  const createMutation = useCreateContact();
  const updateMutation = useUpdateContact();
  const deleteMutation = useDeleteContact();
  const mutation = contact ? updateMutation : createMutation;
  const form = useAppForm({
    defaultValues: {
      name: contact?.name ?? "",
      email: contact?.email ?? "",
      phone: contact?.phone ?? "",
      aliases: contact?.aliases.join(", ") ?? "",
      notes: contact?.notes ?? "",
    },
    validators: { onChange: contactSchema },
    onSubmit: async ({ value }) => {
      const values: ContactWriteInput = {
        name: value.name.trim(),
        email: value.email.trim() || null,
        phone: value.phone.trim() || null,
        aliases: [
          ...new Set(
            value.aliases
              .split(",")
              .map((alias) => alias.trim())
              .filter(Boolean)
          ),
        ],
        notes: value.notes.trim() || null,
      };

      if (contact)
        await updateMutation.mutateAsync({ contactId: contact.id, values });
      else await createMutation.mutateAsync(values);
      onClose();
    },
  });

  async function handleDelete() {
    if (!contact || !window.confirm(`Hapus ${contact.name} dari kontak?`))
      return;
    await deleteMutation.mutateAsync(contact.id);
    onClose();
  }

  return (
    <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
      <DialogTitle>{contact ? "Edit kontak" : "Kontak baru"}</DialogTitle>
      <DialogDescription className="mt-2">
        {contact
          ? "Perbarui cara Sydia mengenali orang ini."
          : "Simpan detail yang membantu Sydia mengenali dan menghubungkan orang ini."}
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
              id="contact-name"
              label="Nama"
              errors={field.state.meta.errors}
            >
              {({ describedBy, invalid }) => (
                <TextField
                  id="contact-name"
                  autoFocus
                  autoComplete="name"
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
        <div className="grid gap-5 sm:grid-cols-2">
          <form.Field name="email">
            {(field) => (
              <FieldShell
                id="contact-email"
                label="Email"
                errors={field.state.meta.errors}
              >
                {({ describedBy, invalid }) => (
                  <TextField
                    id="contact-email"
                    type="email"
                    autoComplete="email"
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
          <form.Field name="phone">
            {(field) => (
              <FieldShell id="contact-phone" label="Telepon">
                {() => (
                  <TextField
                    id="contact-phone"
                    type="tel"
                    autoComplete="tel"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                )}
              </FieldShell>
            )}
          </form.Field>
        </div>
        <form.Field name="aliases">
          {(field) => (
            <FieldShell
              id="contact-aliases"
              label="Nama lain"
              description="Pisahkan beberapa nama dengan koma. Contoh: Budi kantor, Pak Budi."
            >
              {() => (
                <TextField
                  id="contact-aliases"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              )}
            </FieldShell>
          )}
        </form.Field>
        <form.Field name="notes">
          {(field) => (
            <FieldShell id="contact-notes" label="Catatan">
              {() => (
                <Textarea
                  id="contact-notes"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              )}
            </FieldShell>
          )}
        </form.Field>
        <FormError
          message={mutation.error?.message ?? deleteMutation.error?.message}
        />
        <div className="flex flex-col-reverse gap-3 border-t border-surface-1 pt-5 sm:flex-row sm:justify-between">
          {contact ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={deleteMutation.isPending}
              onClick={() => void handleDelete()}
            >
              <Trash2 />{" "}
              {deleteMutation.isPending ? "Menghapus…" : "Hapus kontak"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-3 sm:justify-end">
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
                  {isSubmitting ? "Menyimpan…" : "Simpan kontak"}
                </Button>
              )}
            </form.Subscribe>
          </div>
        </div>
      </form>
    </DialogContent>
  );
}

function ContactRow({
  contact,
  onEdit,
}: {
  contact: Contact;
  onEdit: () => void;
}) {
  return (
    <li className="grid gap-3 py-5 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,1fr)_auto] sm:items-center">
      <button
        type="button"
        className="min-w-0 text-left outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
        onClick={onEdit}
      >
        <span className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-1">
            <UserRound className="size-4 text-brand-deep" />
          </span>
          <span className="truncate font-display font-bold">
            {contact.name}
          </span>
        </span>
        {contact.aliases.length ? (
          <span className="mt-2 flex flex-wrap gap-1.5 pl-12">
            {contact.aliases.map((alias) => (
              <Badge key={alias}>{alias}</Badge>
            ))}
          </span>
        ) : null}
      </button>
      <div className="space-y-1 pl-12 text-sm text-ink-muted sm:pl-0">
        {contact.email ? (
          <a
            className="flex items-center gap-2 break-all text-link underline-offset-4 hover:underline"
            href={`mailto:${contact.email}`}
          >
            <Mail className="size-4 shrink-0" />
            {contact.email}
          </a>
        ) : null}
        {contact.phone ? (
          <a
            className="flex items-center gap-2 text-ink-soft underline-offset-4 hover:underline"
            href={`tel:${contact.phone}`}
          >
            <Phone className="size-4 shrink-0" />
            {contact.phone}
          </a>
        ) : null}
        {!contact.email && !contact.phone ? "Belum ada detail kontak" : null}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Tindakan untuk ${contact.name}`}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil /> Edit kontak
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

export function ContactPage() {
  const [searchDraft, setSearchDraft] = useState("");
  const [queryText, setQueryText] = useState("");
  const [editingContact, setEditingContact] = useState<Contact | "new" | null>(
    null
  );

  const query = useQuery(contactsQueryOptions(queryText));

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQueryText(searchDraft.trim());
  }

  return (
    <div className="space-y-8">
      <DomainPageHeader
        title="Kontak"
        description="Kelola orang dan nama lain yang perlu dikenali Sydia dalam percakapan."
        action={
          <Button onClick={() => setEditingContact("new")}>
            <Plus /> Tambah kontak
          </Button>
        }
      />
      <form
        className="flex max-w-xl gap-2"
        role="search"
        onSubmit={handleSearch}
      >
        <label htmlFor="contact-search" className="sr-only">
          Cari kontak
        </label>
        <Input
          id="contact-search"
          type="search"
          value={searchDraft}
          placeholder="Cari nama, alias, email, atau telepon…"
          onChange={(event) => setSearchDraft(event.target.value)}
        />
        <Button type="submit" variant="dark-outline">
          <Search /> Cari
        </Button>
      </form>
      {query.isPending ? <DomainListSkeleton label="Memuat kontak" /> : null}
      {query.isError ? (
        <DomainInlineError
          title="Kontak tidak dapat dimuat"
          message={query.error.message}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.isSuccess && !query.data.length ? (
        <EmptyState
          title={queryText ? "Kontak tidak ditemukan" : "Belum ada kontak"}
          message={
            queryText
              ? "Periksa ejaan atau cari dengan nama lain."
              : "Tambahkan orang pertama beserta alias yang biasa Anda gunakan di chat."
          }
        />
      ) : null}
      {query.isSuccess && query.data.length ? (
        <ul className="divide-y divide-surface-1 border-y border-surface-1">
          {query.data.map((contact) => (
            <ContactRow
              key={contact.id}
              contact={contact}
              onEdit={() => setEditingContact(contact)}
            />
          ))}
        </ul>
      ) : null}
      <Dialog
        open={Boolean(editingContact)}
        onOpenChange={(open) => !open && setEditingContact(null)}
      >
        {editingContact ? (
          <ContactEditor
            contact={editingContact === "new" ? undefined : editingContact}
            onClose={() => setEditingContact(null)}
          />
        ) : null}
      </Dialog>
    </div>
  );
}
