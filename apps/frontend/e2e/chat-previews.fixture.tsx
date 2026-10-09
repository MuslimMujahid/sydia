import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChatPreviewsPage } from "../src/components/chat/chat-previews-page";
import "../src/styles/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("Chat preview fixture root is missing");
createRoot(root).render(
  <QueryClientProvider
    client={
      new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    }
  >
    <ChatPreviewsPage locale="en" timezone="Asia/Makassar" />
  </QueryClientProvider>
);
