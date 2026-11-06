import { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceSearch } from "../src/components/notes/workspace-search";
import "../src/styles/globals.css";

function Fixture() {
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(true);

  return (
    <main>
      <label>
        Cari catatan
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <button onClick={() => setVisible(false)}>Tutup pencarian</button>
      {visible ? (
        <WorkspaceSearch query={query} items={[]} onOpen={() => {}} />
      ) : null}
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Notes search fixture root is missing");
createRoot(root).render(
  <QueryClientProvider client={new QueryClient()}>
    <Fixture />
  </QueryClientProvider>
);
