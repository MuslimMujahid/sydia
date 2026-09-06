import { createFileRoute } from "@tanstack/react-router";
import { DocumentPage } from "@/components/documents/document-page";

export const Route = createFileRoute("/_app/files")({
  head: () => ({
    meta: [
      { title: "File · Sydia" },
      {
        name: "description",
        content: "Unggah, periksa, dan gunakan dokumen, gambar, atau audio di Sydia.",
      },
    ],
  }),
  component: DocumentPage,
});
