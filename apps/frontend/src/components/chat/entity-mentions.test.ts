import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Element, Root } from "hast";
import type { ChatEntity } from "./chat-entities";
import { enrichEntityMentions, rehypeEntityMentions } from "./entity-mentions";

const task: ChatEntity = {
  kind: "task",
  id: "task-1",
  title: "Baca buku",
  mutation: true,
  observedAt: "2026-10-08T08:00:00.000Z",
};

function element(
  tagName: string,
  value: string,
  properties: Element["properties"] = {}
): Element {
  return {
    type: "element",
    tagName,
    properties,
    children: [{ type: "text", value }],
  };
}

function tree(...children: Element[]): Root {
  return { type: "root", children };
}

describe("entity Markdown enrichment", () => {
  it("uses a confirmed task ID when two lookup results have the same title", () => {
    const markdown = tree(element("a", "Baca buku", { href: "#task/task-1" }));

    const mentioned = enrichEntityMentions(markdown, [
      task,
      { ...task, id: "task-2" },
    ]);

    assert.deepEqual([...mentioned], ["task:task-1"]);
    assert.deepEqual(
      markdown,
      tree(
        element("span", "Baca buku", {
          "data-entity-key": "task:task-1",
        })
      )
    );
  });

  it("renders an unconfirmed task reference as text and reports it", () => {
    const markdown = tree(element("a", "Baca buku", { href: "#task/unknown" }));
    const warnings: unknown[][] = [];
    const originalWarn = console.warn;

    console.warn = (...args: unknown[]) => {
      warnings.push(args);
    };

    try {
      const mentioned = enrichEntityMentions(markdown, []);
      assert.equal(mentioned.size, 0);
      assert.deepEqual(markdown, tree(element("span", "Baca buku")));
      assert.equal(warnings.length, 1);
    } finally {
      console.warn = originalWarn;
    }
  });

  it("uses the confirmed title rather than a misleading task link label", () => {
    const markdown = tree(element("a", "Other task", { href: "#task/task-1" }));
    enrichEntityMentions(markdown, [task]);
    assert.deepEqual(
      markdown,
      tree(
        element("span", "Baca buku", {
          "data-entity-key": "task:task-1",
        })
      )
    );
  });

  it("defers unconfirmed reference warnings while tool snapshots are still streaming", () => {
    const markdown = tree(element("a", "Baca buku", { href: "#task/task-1" }));
    const warnings: unknown[][] = [];
    const originalWarn = console.warn;

    console.warn = (...args: unknown[]) => {
      warnings.push(args);
    };

    try {
      rehypeEntityMentions([], false)()(markdown);
      assert.deepEqual(markdown, tree(element("span", "Baca buku")));
      assert.equal(warnings.length, 0);
    } finally {
      console.warn = originalWarn;
    }
  });

  it("recognizes a title split across Markdown emphasis", () => {
    const markdown = tree({
      type: "element",
      tagName: "p",
      properties: {},
      children: [
        { type: "text", value: "Tugas Baca " },
        element("strong", "buku"),
        { type: "text", value: " dibuat." },
      ],
    });

    enrichEntityMentions(markdown, [task]);
    assert.deepEqual(
      markdown,
      tree({
        type: "element",
        tagName: "p",
        properties: {},
        children: [
          { type: "text", value: "Tugas " },
          element("span", "Baca buku", { "data-entity-key": "task:task-1" }),
          { type: "text", value: " dibuat." },
        ],
      })
    );
  });
  it("recognizes a name inside emphasis without removing that emphasis", () => {
    const markdown = tree(element("strong", "Baca buku"));
    const mentioned = enrichEntityMentions(markdown, [task]);
    assert.deepEqual([...mentioned], ["task:task-1"]);
    assert.deepEqual(markdown.children, [
      {
        type: "element",
        tagName: "strong",
        properties: {},
        children: [
          element("span", "Baca buku", { "data-entity-key": "task:task-1" }),
        ],
      },
    ]);
  });
  it("keeps inline code unchanged", () => {
    const markdown = tree(element("code", "Baca buku"));
    assert.equal(enrichEntityMentions(markdown, [task]).size, 0);
    assert.deepEqual(markdown, tree(element("code", "Baca buku")));
  });
  it("keeps unrelated links unchanged", () => {
    const markdown = tree(
      element("a", "Baca buku", { href: "https://example.test" })
    );

    assert.equal(enrichEntityMentions(markdown, [task]).size, 0);
    assert.deepEqual(
      markdown,
      tree(element("a", "Baca buku", { href: "https://example.test" }))
    );
  });
  it("replaces a verified sent-file link without nesting a button in an anchor", () => {
    const file: ChatEntity = {
      kind: "file",
      id: "doc-1",
      title: "Invoice.pdf",
      url: "https://example.test/file",
      mutation: true,
      observedAt: task.observedAt,
    };

    const markdown = tree(element("a", "Download", { href: file.url }));
    enrichEntityMentions(markdown, [file]);
    assert.deepEqual(
      markdown,
      tree(element("span", "Invoice.pdf", { "data-entity-key": "file:doc-1" }))
    );
  });
  it("appends an accessible entity reference when a mutation response omits its name", () => {
    const markdown = tree(element("p", "Tugas dibuat."));
    rehypeEntityMentions([task])()(markdown);
    assert.deepEqual(markdown.children[1], {
      type: "element",
      tagName: "p",
      properties: {},
      children: [
        element("span", "Baca buku", { "data-entity-key": "task:task-1" }),
      ],
    });
  });
  it("does not append a second reference for an already mentioned entity", () => {
    const markdown = tree(element("p", "Baca buku dibuat."));
    rehypeEntityMentions([task])()(markdown);
    assert.equal(markdown.children.length, 1);
  });
  it("does not append every lookup result to the answer", () => {
    const markdown = tree(element("p", "Tidak ada yang perlu dikerjakan."));
    rehypeEntityMentions([{ ...task, mutation: false }])()(markdown);
    assert.equal(markdown.children.length, 1);
  });
  it("does not append incomplete references during streaming", () => {
    const markdown = tree(element("p", "Tugas"));
    rehypeEntityMentions([task], false)()(markdown);
    assert.equal(markdown.children.length, 1);
  });
});
