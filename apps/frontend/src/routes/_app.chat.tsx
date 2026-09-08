import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

const legacyChatSearchSchema = z.object({
  attachment: z.string().optional(),
});

export const Route = createFileRoute("/_app/chat")({
  validateSearch: legacyChatSearchSchema,
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/",
      search: { attachment: search.attachment, conversation: undefined },
      replace: true,
    });
  },
});
