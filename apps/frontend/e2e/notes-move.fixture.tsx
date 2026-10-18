import { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceDialog } from "../src/components/notes/workspace-dialog";
import type { WorkspaceItem } from "../src/lib/services/api/notes/notes.api";
import "../src/styles/globals.css";

function folder(
  id: string,
  title: string,
  parentId: string | null,
  path: string
): WorkspaceItem {
  return {
    id,
    title,
    parentId,
    path,
    kind: "folder",
    revision: 1,
    trashedAt: null,
    trashBatchId: null,
    createdAt: "2026-10-18T00:00:00Z",
    updatedAt: "2026-10-18T00:00:00Z",
  };
}

const work = folder("work", "Kerja", null, "Kerja");
const project = folder("project", "Proyek", "work", "Kerja / Proyek");
const sydia = folder("sydia", "Sydia", "project", "Kerja / Proyek / Sydia");
const note: WorkspaceItem = {
  ...folder(
    "note",
    "Rencana peluncuran",
    "sydia",
    "Kerja / Proyek / Sydia / Rencana peluncuran"
  ),
  kind: "note",
};

const items = [
  work,
  project,
  sydia,
  folder("reference", "Referensi", "work", "Kerja / Referensi"),
  folder("private", "Pribadi", null, "Pribadi"),
  {
    ...folder("trash", "Terhapus", null, "Terhapus"),
    trashedAt: "2026-10-18T00:00:00Z",
  },
  note,
];

function Fixture() {
  const [open, setOpen] = useState(true);
  const item = new URLSearchParams(window.location.search).has("folder")
    ? work
    : note;

  return (
    <main>
      {open ? (
        <WorkspaceDialog
          target={{ action: "move", item }}
          items={items}
          onClose={() => setOpen(false)}
          onChanged={async () => {}}
        />
      ) : (
        <p>Dialog ditutup</p>
      )}
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Notes move fixture root is missing");
createRoot(root).render(
  <QueryClientProvider client={new QueryClient()}>
    <Fixture />
  </QueryClientProvider>
);
