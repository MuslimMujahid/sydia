import { createFileRoute } from "@tanstack/react-router";
import { MemoryPage } from "@/components/memories/memory-page";

export const Route = createFileRoute("/_app/memory")({
  head: () => ({
    meta: [
      { title: "Memori · Sydia" },
      {
        name: "description",
        content: "Cari, periksa, dan kelola memori yang dapat digunakan Sydia.",
      },
    ],
  }),
  component: MemoryPage,
});
