import type { Element, Root, RootContent, Text } from "hast";
import { entityKey, matchEntityText, type ChatEntity } from "./chat-entities";

function mention(entity: ChatEntity, label: string): Element {
  return {
    type: "element",
    tagName: "span",
    properties: { "data-entity-key": entityKey(entity) },
    children: [{ type: "text", value: label }],
  };
}

function inlineText(node: RootContent): string | null {
  if (node.type === "text") return node.value;
  if (
    node.type !== "element" ||
    !["strong", "em", "del"].includes(node.tagName)
  )
    return null;
  const children = node.children.map(inlineText);

  return children.every((value) => value !== null) ? children.join("") : null;
}

/** Preserve emphasis around text outside a mention that crosses inline nodes. */
function sliceInline(
  nodes: RootContent[],
  start: number,
  end: number
): Array<Element | Text> {
  const result: Array<Element | Text> = [];
  let offset = 0;

  for (const node of nodes) {
    const value = inlineText(node);
    if (value === null)
      throw new Error("Entity text slice contains a non-text node");
    const from = Math.max(0, start - offset);
    const to = Math.min(value.length, end - offset);

    if (from < to) {
      if (node.type === "text")
        result.push({ type: "text", value: node.value.slice(from, to) });
      else if (node.type === "element")
        result.push({
          ...node,
          children: sliceInline(node.children, from, to),
        });
    }

    offset += value.length;
  }

  return result;
}

/** Transform rendered Markdown text, never raw Markdown, code, or arbitrary links. */
export function enrichEntityMentions(
  tree: Root,
  entities: ChatEntity[],
  reportUnconfirmed = true
): Set<string> {
  const mentioned = new Set<string>();

  function visit(parent: Root | Element) {
    const result: RootContent[] = [];
    const children = parent.children;

    for (let index = 0; index < children.length;) {
      const node = children[index]!;

      if (inlineText(node) !== null) {
        const run: RootContent[] = [];
        while (index < children.length && inlineText(children[index]!) !== null)
          run.push(children[index++]!);
        const value = run.map(inlineText).join("");
        let offset = 0;

        for (const part of matchEntityText(value, entities)) {
          const fragment = sliceInline(run, offset, offset + part.text.length);
          if (part.entity) {
            mentioned.add(entityKey(part.entity));
            // Keep enclosing emphasis when the entire name fits inside it.
            if (fragment.length === 1 && fragment[0]?.type === "element") {
              result.push({
                ...fragment[0],
                children: [mention(part.entity, part.text)],
              });
            } else result.push(mention(part.entity, part.text));
          } else result.push(...fragment);
          offset += part.text.length;
        }

        continue;
      }

      index += 1;

      if (node.type === "element") {
        if (node.tagName === "code" || node.tagName === "pre") {
          result.push(node);
          continue;
        }

        if (node.tagName === "a") {
          const href = node.properties.href;

          if (typeof href === "string" && href.startsWith("#task/")) {
            const task = entities.find(
              (entity) =>
                entity.kind === "task" &&
                href === `#task/${encodeURIComponent(entity.id)}`
            );

            if (task) {
              mentioned.add(entityKey(task));
              result.push(mention(task, task.title));
            } else {
              // Degraded display: retain the label, never expose an unverified
              // task link or guess an ID from another answer.
              if (reportUnconfirmed)
                console.warn(
                  "Unconfirmed task reference in assistant response"
                );
              result.push({ ...node, tagName: "span", properties: {} });
            }

            continue;
          }

          const file = entities.find(
            (entity) =>
              entity.kind === "file" && entity.url && entity.url === href
          );

          if (file) {
            mentioned.add(entityKey(file));
            result.push(mention(file, file.title));
          } else result.push(node);
          continue;
        }

        visit(node);
      }

      result.push(node);
    }

    parent.children = result as Element["children"];
  }

  visit(tree);

  return mentioned;
}

/** Also expose mutated records when the assistant only says "Task created". */
export function rehypeEntityMentions(
  entities: ChatEntity[],
  appendUnmentioned = true
) {
  return () => (tree: Root) => {
    // Streaming text may arrive before the terminal turn's tool snapshots.
    // Defer diagnostics until the completed reply, while retaining its label.
    const mentioned = enrichEntityMentions(tree, entities, appendUnmentioned);
    const unmentioned = entities.filter(
      (entity) => entity.mutation && !mentioned.has(entityKey(entity))
    );

    if (!appendUnmentioned || !unmentioned.length) return;
    tree.children.push({
      type: "element",
      tagName: "p",
      properties: {},
      children: unmentioned.flatMap((entity, index): Array<Element | Text> => [
        ...(index ? [{ type: "text" as const, value: " " }] : []),
        mention(entity, entity.title),
      ]),
    });
  };
}
