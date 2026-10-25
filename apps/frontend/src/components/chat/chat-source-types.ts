import type { JSONContent } from "@tiptap/react";

export type ChatSource = {
  kind: "file" | "folder" | "note";
  id: string;
  label: string;
  path?: string;
};
export type ChatSegment =
  { type: "text"; text: string } | { type: "source"; source: ChatSource };
export const sourceKey = (source: ChatSource) => `${source.kind}:${source.id}`;
export const segmentText = (segments: ChatSegment[]) =>
  segments.map((s) => (s.type === "text" ? s.text : s.source.label)).join("");

export function composerSegments(doc: JSONContent): ChatSegment[] {
  const result: ChatSegment[] = [];

  function text(value: string) {
    const prior = result.at(-1);
    if (prior?.type === "text") prior.text += value;
    else result.push({ type: "text", text: value });
  }

  function visit(node: JSONContent) {
    if (node.type === "chatSource")
      result.push({ type: "source", source: node.attrs?.source as ChatSource });
    else if (node.type === "text") text(node.text ?? "");
    else if (node.type === "hardBreak") text("\n");
    else
      node.content?.forEach((child, i) => {
        if (i && child.type === "paragraph") text("\n");
        visit(child);
      });
  }

  visit(doc);

  return result;
}
