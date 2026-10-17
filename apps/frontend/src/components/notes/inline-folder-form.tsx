import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createWorkspaceItem } from "@/lib/services/api/notes/notes.api";

type InlineFolderFormProps = {
  parentId: string | null;
  parentLabel: string;
  requestKey: string;
  onClose: () => void;
  onCreated: () => Promise<void>;
};

export function InlineFolderForm({
  parentId,
  parentLabel,
  requestKey,
  onClose,
  onCreated,
}: InlineFolderFormProps) {
  const [title, setTitle] = useState("");
  const mutation = useMutation({
    mutationFn: async () => {
      await createWorkspaceItem({
        kind: "folder",
        title,
        parentId,
        requestKey,
      });
      await onCreated();
      onClose();
    },
  });

  return (
    <form
      aria-label="Folder baru"
      className="mb-3 space-y-2 rounded-sm bg-canvas px-2 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim() && !mutation.isPending) mutation.mutate();
      }}
    >
      <p className="truncate text-xs text-ink-muted">Di {parentLabel}</p>
      <label className="block text-xs font-semibold" htmlFor="new-folder-title">
        Nama folder
      </label>
      <Input
        id="new-folder-title"
        autoFocus
        value={title}
        disabled={mutation.isPending}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !mutation.isPending) onClose();
        }}
      />
      {mutation.error ? (
        <p className="text-xs text-destructive" role="alert">
          {mutation.error.message}
        </p>
      ) : null}
      <div className="flex justify-end gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Batal membuat folder"
          disabled={mutation.isPending}
          onClick={onClose}
        >
          <X />
        </Button>
        <Button
          variant="dark"
          size="icon"
          aria-label="Simpan folder"
          type="submit"
          disabled={!title.trim() || mutation.isPending}
        >
          <Check />
        </Button>
      </div>
    </form>
  );
}
