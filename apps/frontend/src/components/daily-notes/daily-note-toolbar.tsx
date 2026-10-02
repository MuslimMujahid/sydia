import { useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  ChevronDown,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pilcrow,
  Underline,
  Unlink,
  type LucideIcon,
} from "lucide-react";
import {
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

const BLOCK_STYLES = {
  paragraph: { label: "Teks biasa", icon: Pilcrow },
  heading1: { label: "Judul 1", icon: Heading1 },
  heading2: { label: "Judul 2", icon: Heading2 },
  heading3: { label: "Judul 3", icon: Heading3 },
} satisfies Record<string, { label: string; icon: LucideIcon }>;

type BlockStyle = keyof typeof BLOCK_STYLES;

const BLOCK_STYLE_ORDER: BlockStyle[] = [
  "paragraph",
  "heading1",
  "heading2",
  "heading3",
];

const HEADING_LEVELS = { heading1: 1, heading2: 2, heading3: 3 } as const;

function isBlockStyle(value: unknown): value is BlockStyle {
  return BLOCK_STYLE_ORDER.some((style) => style === value);
}

/**
 * Pressing a toolbar control must not move focus out of the editor: the
 * selection stays put and the on-screen keyboard stays open on phones.
 */
function keepEditorFocus(event: MouseEvent) {
  event.preventDefault();
}

type DailyNoteToolbarProps = {
  editor: Editor;
  /** Rendered at the end of the row, e.g. the save status. */
  status?: ReactNode;
};

type ToolbarButtonProps = {
  label: string;
  active?: boolean;
  expanded?: boolean;
  children: ReactNode;
  onClick: () => void;
};

function ToolbarButton({
  label,
  active = false,
  expanded,
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
      aria-expanded={expanded}
      className={cn(active && "bg-brand text-canvas hover:text-canvas")}
      onMouseDown={keepEditorFocus}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function ToolbarSeparator() {
  return (
    <span
      className="mx-0.5 h-6 w-px shrink-0 bg-hairline sm:mx-1"
      aria-hidden="true"
    />
  );
}

export function DailyNoteToolbar({ editor, status }: DailyNoteToolbarProps) {
  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      const link = currentEditor.getAttributes("link");
      const blockStyle: BlockStyle = currentEditor.isActive("heading", {
        level: 1,
      })
        ? "heading1"
        : currentEditor.isActive("heading", { level: 2 })
          ? "heading2"
          : currentEditor.isActive("heading", { level: 3 })
            ? "heading3"
            : "paragraph";

      return {
        blockStyle,
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
  const blockStyleChosenRef = useRef(false);
  const activeBlockStyle = BLOCK_STYLES[toolbarState.blockStyle];
  const ActiveBlockIcon = activeBlockStyle.icon;

  function applyBlockStyle(value: unknown) {
    if (!isBlockStyle(value)) return;

    blockStyleChosenRef.current = true;

    if (value === "paragraph") {
      editor.chain().focus().setParagraph().run();

      return;
    }

    editor.chain().focus().setHeading({ level: HEADING_LEVELS[value] }).run();
  }

  function closeLinkForm() {
    setLinkOpen(false);
    editor.commands.focus();
  }

  function applyLink() {
    const href = linkHref.trim();
    const chain = editor.chain().focus().extendMarkRange("link");

    if (!href) chain.unsetLink().run();
    else if (editor.state.selection.empty && !toolbarState.link)
      // Nothing selected: insert the address itself as the link text.
      chain
        .insertContent({
          type: "text",
          text: href,
          marks: [{ type: "link", attrs: { href } }],
        })
        .run();
    else chain.setLink({ href }).run();

    setLinkOpen(false);
  }

  function removeLink() {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkHref("");
    setLinkOpen(false);
  }

  // The link controls are a group rather than a <form>: the toolbar can sit
  // inside another form (the task editor), where nested forms are invalid and
  // Enter would submit the outer form.
  function handleLinkKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      applyLink();

      return;
    }

    if (event.key !== "Escape") return;

    // Close only the link controls, not a surrounding dialog.
    event.preventDefault();
    event.stopPropagation();
    closeLinkForm();
  }

  return (
    <div>
      <div className="flex items-center gap-1 px-2 py-2 sm:px-3">
        {/* One row on phones; scrolls sideways only below ~340px. */}
        <div
          role="toolbar"
          aria-label="Pemformatan catatan"
          className="-m-1 flex min-w-0 flex-1 items-center overflow-x-auto p-1 [scrollbar-width:none] sm:gap-0.5 [&::-webkit-scrollbar]:hidden"
        >
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "gap-0.5 px-2",
                    toolbarState.blockStyle !== "paragraph" && "text-ink"
                  )}
                  aria-label={`Gaya teks: ${activeBlockStyle.label}`}
                />
              }
            >
              <ActiveBlockIcon aria-hidden="true" />
              <ChevronDown className="size-3" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              finalFocus={() => {
                if (!blockStyleChosenRef.current) return true;

                blockStyleChosenRef.current = false;

                return editor.view.dom;
              }}
            >
              <DropdownMenuRadioGroup
                value={toolbarState.blockStyle}
                onValueChange={applyBlockStyle}
              >
                {BLOCK_STYLE_ORDER.map((value) => {
                  const style = BLOCK_STYLES[value];
                  const Icon = style.icon;

                  return (
                    <DropdownMenuRadioItem
                      key={value}
                      value={value}
                      closeOnClick
                    >
                      <Icon aria-hidden="true" />
                      {style.label}
                    </DropdownMenuRadioItem>
                  );
                })}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <ToolbarSeparator />
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
          <ToolbarSeparator />
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
            expanded={linkOpen}
            onClick={() => {
              setLinkHref(toolbarState.href);
              setLinkOpen((current) => !current);
            }}
          >
            <Link2 />
          </ToolbarButton>
        </div>
        {status ? <div className="shrink-0 pl-1">{status}</div> : null}
      </div>
      {linkOpen ? (
        <div
          role="group"
          aria-label="Tautan"
          className="flex flex-col gap-2 border-t border-ink/8 px-3 py-2 sm:flex-row sm:items-center sm:px-4"
          onKeyDown={handleLinkKeyDown}
        >
          <Input
            type="url"
            inputMode="url"
            value={linkHref}
            placeholder="https://contoh.com"
            aria-label="Alamat tautan"
            className="min-w-0 flex-1"
            autoFocus
            onChange={(event) => setLinkHref(event.target.value)}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="dark-outline"
              size="sm"
              onClick={applyLink}
            >
              Terapkan
            </Button>
            {toolbarState.link ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={removeLink}
              >
                <Unlink />
                Hapus tautan
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={closeLinkForm}
              >
                Batal
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
