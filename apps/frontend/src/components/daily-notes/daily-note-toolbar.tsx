import { useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  RemoveFormatting,
  Underline,
} from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

type DailyNoteToolbarProps = {
  editor: Editor;
};

type ToolbarButtonProps = {
  label: string;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
  onClick: () => void;
};

function ToolbarButton({
  label,
  active = false,
  disabled = false,
  children,
  onClick,
}: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      className={cn(active && "bg-brand text-canvas hover:text-canvas")}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export function DailyNoteToolbar({ editor }: DailyNoteToolbarProps) {
  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      const link = currentEditor.getAttributes("link");

      return {
        heading1: currentEditor.isActive("heading", { level: 1 }),
        heading2: currentEditor.isActive("heading", { level: 2 }),
        heading3: currentEditor.isActive("heading", { level: 3 }),
        bulletList: currentEditor.isActive("bulletList"),
        orderedList: currentEditor.isActive("orderedList"),
        bold: currentEditor.isActive("bold"),
        italic: currentEditor.isActive("italic"),
        underline: currentEditor.isActive("underline"),
        link: currentEditor.isActive("link"),
        href: typeof link.href === "string" ? link.href : "",
      };
    },
  });

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkHref, setLinkHref] = useState("");

  function applyLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const href = linkHref.trim();

    if (!href) {
      editor.chain().focus().unsetLink().run();
      setLinkOpen(false);

      return;
    }

    editor.chain().focus().setLink({ href }).run();
    setLinkOpen(false);
  }

  function removeLink() {
    editor.chain().focus().unsetLink().run();
    setLinkHref("");
    setLinkOpen(false);
  }

  return (
    <div className="border-b border-ink/8 bg-canvas p-2">
      <div
        className="flex flex-wrap items-center gap-1"
        role="toolbar"
        aria-label="Pemformatan catatan"
      >
        <div className="flex items-center gap-1" aria-label="Judul">
          {([1, 2, 3] as const).map((level) => (
            <ToolbarButton
              key={level}
              label={`Judul ${level}`}
              active={toolbarState[`heading${level}`]}
              onClick={() =>
                editor.chain().focus().toggleHeading({ level }).run()
              }
            >
              <span className="font-display text-sm font-semibold">
                H{level}
              </span>
            </ToolbarButton>
          ))}
        </div>
        <span className="mx-1 h-6 w-px bg-hairline" aria-hidden="true" />
        <ToolbarButton
          label="Daftar berpoin"
          active={toolbarState.bulletList}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List />
        </ToolbarButton>
        <ToolbarButton
          label="Daftar bernomor"
          active={toolbarState.orderedList}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered />
        </ToolbarButton>
        <span className="mx-1 h-6 w-px bg-hairline" aria-hidden="true" />
        <ToolbarButton
          label="Tebal"
          active={toolbarState.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold />
        </ToolbarButton>
        <ToolbarButton
          label="Miring"
          active={toolbarState.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic />
        </ToolbarButton>
        <ToolbarButton
          label="Garis bawah"
          active={toolbarState.underline}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <Underline />
        </ToolbarButton>
        <ToolbarButton
          label={toolbarState.link ? "Ubah tautan" : "Tambah tautan"}
          active={toolbarState.link}
          onClick={() => {
            setLinkHref(toolbarState.href);
            setLinkOpen((current) => !current);
          }}
        >
          <Link2 />
        </ToolbarButton>
      </div>
      {linkOpen ? (
        <form
          className="mt-2 flex flex-col gap-2 border-t border-ink/8 pt-2 sm:flex-row sm:items-center"
          onSubmit={applyLink}
        >
          <label className="min-w-0 flex-1">
            <span className="sr-only">Alamat tautan</span>
            <Input
              type="url"
              inputMode="url"
              value={linkHref}
              placeholder="https://contoh.com"
              aria-label="Alamat tautan"
              autoFocus
              onChange={(event) => setLinkHref(event.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" variant="dark-outline" size="sm">
              Terapkan
            </Button>
            {toolbarState.link ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={removeLink}
              >
                <RemoveFormatting />
                Hapus tautan
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
