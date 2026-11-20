import type {
  ChatSegment,
  ChatSource,
} from "@/lib/services/api/conversations/conversations.api";

export function composerSourceSegments(
  content: string,
  sources: ChatSource[]
): ChatSegment[] | undefined {
  if (!sources.length) return undefined;

  const segments: ChatSegment[] = [{ type: "text", text: content }];
  for (const source of sources) {
    segments.push({ type: "text", text: " " }, { type: "source", source });
  }
  return segments;
}
