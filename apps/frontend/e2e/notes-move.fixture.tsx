import { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceTree } from "../src/components/notes/workspace-tree";
import { WorkspaceDailyNavigation } from "../src/components/notes/workspace-daily-navigation";
import {
  FolderCreationErrorPopup,
  useFolderCreation,
} from "../src/components/notes/inline-folder-form";
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

function TreeFixture() {
  const [selectedRef, setSelectedRef] = useState<string | null>("custom:note");
  const folderCreation = useFolderCreation({ onCreated: async () => {} });
  const longTitle = new URLSearchParams(window.location.search).has(
    "long-title"
  );

  const deepTree = new URLSearchParams(window.location.search).has("deep-tree");
  const ancestors = Array.from({ length: 8 }, (_, index) =>
    folder(
      `deep-${index}`,
      `Folder ${index + 1}`,
      index === 0 ? null : `deep-${index - 1}`,
      `Folder ${index + 1}`
    )
  );

  const baseItems = deepTree
    ? [...ancestors, { ...note, parentId: "deep-7" }]
    : items;

  const treeItems = longTitle
    ? baseItems.map((item) =>
        item.id === note.id
          ? {
              ...item,
              title:
                "Rencana peluncuran dengan judul yang sangat panjang untuk catatan proyek Sydia",
            }
          : item
      )
    : baseItems;

  return (
    <main>
      <section
        aria-label="Navigasi catatan"
        className="flex h-120 w-70 flex-col overflow-hidden pr-4"
      >
        <div className="shrink-0">
          <WorkspaceDailyNavigation
            today="2026-10-23"
            selectedDate={null}
            entries={[]}
            loading={false}
            onSelectDate={() => {}}
          />
          <h2 className="mt-7 mb-2 px-2 text-xs font-semibold text-ink-muted">
            Folder
          </h2>
        </div>
        <div className="-mr-4 min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <WorkspaceTree
            items={treeItems}
            folderCreation={folderCreation}
            selectedRef={selectedRef}
            onNote={setSelectedRef}
            onAction={() => {}}
            onMove={() => {}}
          />
        </div>
      </section>
      <p role="status">{selectedRef}</p>
      <FolderCreationErrorPopup creation={folderCreation} />
    </main>
  );
}

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
    {window.location.hash === "#tree" ? <TreeFixture /> : <Fixture />}
  </QueryClientProvider>
);
