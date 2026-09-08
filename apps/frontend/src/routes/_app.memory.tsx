import { createFileRoute, redirect } from "@tanstack/react-router";
import { MemoryPage } from "@/components/memories/memory-page";

export const Route = createFileRoute("/_app/memory")({
  beforeLoad: () => {
    if (import.meta.env.VITE_DEBUG_ENABLED !== "true") {
      throw redirect({ to: "/" });
    }
  },
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
