import { InputRule, Node, mergeAttributes } from "@tiptap/core";

/**
 * The web's `noteLink` node (apps/frontend/src/components/notes/note-link.tsx)
 * without its React node view: same name, attributes, HTML, text, and the
 * `[[label]]` input rule, so documents round-trip between web and mobile.
 */
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
