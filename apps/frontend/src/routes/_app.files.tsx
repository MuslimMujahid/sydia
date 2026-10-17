import { createFileRoute } from "@tanstack/react-router";
import { DocumentPage } from "@/components/documents/document-page";
import { z } from "zod";

export const Route = createFileRoute("/_app/files")({
  validateSearch: z.object({
    folder: z.string().min(1).optional(),
    q: z.string().max(255).optional(),
    sort: z.enum(["name", "createdAt"]).optional(),
    direction: z.enum(["asc", "desc"]).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
  }),
  head: () => ({
    meta: [
      { title: "File · Sydia" },
      {
        name: "description",
        content:
          "Unggah, periksa, dan gunakan dokumen, gambar, atau audio di Sydia.",
      },
    ],
  }),
  component: DocumentPage,
});
