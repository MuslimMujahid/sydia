import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { composerSegments, segmentText } from "./chat-source-types";

describe("composer source segments", () => {
  it("retains source identities between ordered text segments", () => {
    const segments = composerSegments({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Compare " },
            {
              type: "chatSource",
              attrs: {
                source: { kind: "file", id: "budget", label: "Budget.pdf" },
              },
            },
            { type: "text", text: " with " },
            {
              type: "chatSource",
              attrs: {
                source: { kind: "note", id: "custom:plan", label: "Plan" },
              },
            },
          ],
        },
      ],
    });

    assert.deepEqual(segments, [
      { type: "text", text: "Compare " },
      {
        type: "source",
        source: { kind: "file", id: "budget", label: "Budget.pdf" },
      },
      { type: "text", text: " with " },
      {
        type: "source",
        source: { kind: "note", id: "custom:plan", label: "Plan" },
      },
    ]);
  });
  it("preserves paragraphs and explicit line breaks", () => {
    assert.deepEqual(
      composerSegments({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "One" },
              { type: "hardBreak" },
              { type: "text", text: "Two" },
            ],
          },
          { type: "paragraph", content: [{ type: "text", text: "Three" }] },
        ],
      }),
      [{ type: "text", text: "One\nTwo\nThree" }]
    );
  });
  it("keeps repeated references rather than losing their insertion positions", () => {
    const source = { kind: "folder" as const, id: "work", label: "Work" };
    assert.deepEqual(
      composerSegments({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "chatSource", attrs: { source } },
              { type: "text", text: " then " },
              { type: "chatSource", attrs: { source } },
            ],
          },
        ],
      }),
      [
        { type: "source", source },
        { type: "text", text: " then " },
        { type: "source", source },
      ]
    );
  });
  it("renders labels without turning literal at-sign text into identities", () => {
    assert.equal(
      segmentText([
        { type: "text", text: "mail@example.com @ " },
        {
          type: "source",
          source: { kind: "note", id: "daily:2026-10-25", label: "25 October" },
        },
      ]),
      "mail@example.com @ 25 October"
    );
  });
});
