import { createContext, useContext } from "react";
import {
  InputRule,
  Node,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  mergeAttributes,
  type NodeViewProps,
} from "@tiptap/react";
import type { NoteEntry } from "@/lib/services/api/notes/notes.api";

export type LinkRequest = {
  label: string;
  from?: number;
  to?: number;
  position?: number;
};
type NoteLinks = {
  entries: NoteEntry[];
  open: (ref: string) => void;
  choose: (request: LinkRequest) => void;
};
export const NoteLinksContext = createContext<NoteLinks | null>(null);

function NoteLinkView({ node, getPos }: NodeViewProps) {
  const context = useContext(NoteLinksContext);
  const target: unknown = node.attrs.target;
  const label: unknown = node.attrs.label;
  const destination =
    typeof target === "string"
      ? context?.entries.find((entry) => entry.ref === target)
      : undefined;

  const text =
    destination?.title ??
    (typeof label === "string" ? label : "Tautan catatan");

  return (
    <NodeViewWrapper as="span" className="inline" contentEditable={false}>
      <a
        href={
          destination
            ? `/notes?${destination.kind === "daily" ? `date=${encodeURIComponent(destination.ref.slice(6))}` : `note=${encodeURIComponent(destination.id)}`}`
            : "#"
        }
        className="cursor-pointer text-ink underline decoration-brand/70 underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand"
        aria-label={
          destination ? `Buka ${text}` : `Pilih atau buat catatan: ${text}`
        }
        onClick={(event) => {
          event.preventDefault();
          if (destination) context?.open(destination.ref);
          else context?.choose({ label: text, position: getPos() });
        }}
      >
        {text}
        {!destination && typeof target === "string" ? " (tidak tersedia)" : ""}
      </a>
    </NodeViewWrapper>
  );
}

export const NoteLink = Node.create({
  name: "noteLink",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return { target: { default: null }, label: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "span[data-note-link]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-note-link": "true" }),
      String(HTMLAttributes.label),
    ];
  },
  renderText({ node }) {
    return String(node.attrs.label);
  },
  addNodeView() {
    return ReactNodeViewRenderer(NoteLinkView);
  },
  addInputRules() {
    return [
      new InputRule({
        find: /\[\[([^[\]]+)\]\]$/,
        handler: ({ state, range, match }) => {
          state.tr.replaceWith(
            range.from,
            range.to,
            this.type.create({ target: null, label: match[1] })
          );
        },
      }),
    ];
  },
});
