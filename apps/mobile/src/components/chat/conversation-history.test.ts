import { expect, test } from "bun:test";
import type { ConversationSummary } from "@/lib/services/api/conversations/conversations.api";
import { matchingConversations } from "./conversation-history";

const conversations: ConversationSummary[] = [
  {
    id: "one",
    title: "Meeting notes",
    lastMessagePreview: null,
    lastMessageAt: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "two",
    title: null,
    lastMessagePreview: "Book meeting room",
    lastMessageAt: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "three",
    title: "Shopping",
    lastMessagePreview: null,
    lastMessageAt: null,
    createdAt: "",
    updatedAt: "",
  },
];

test("chat history searches titles and previews without changing server order", () => {
  expect(
    matchingConversations(conversations, "  MEETING ", "en").map(({ id }) => id)
  ).toEqual(["one", "two"]);
});

test("blank search displays all conversations", () => {
  expect(matchingConversations(conversations, " ", "id")).toEqual(
    conversations
  );
});
