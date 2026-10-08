import { QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import {
  ReminderPage,
  CompactReminderRow,
} from "../src/components/reminders/reminder-page";
import { useQuery } from "@tanstack/react-query";
import { remindersQueryOptions } from "../src/lib/services/api/reminders/reminders.queries";
import { createQueryClient } from "../src/lib/query-client";
import { MessageHistory } from "../src/components/chat/message-history";
import type {
  ConversationMessage,
  ToolInvocation,
} from "../src/lib/services/api/conversations/conversations.api";
import "../src/styles/globals.css";

const timestamp = "2026-10-08T08:00:00.000Z";
const records = [
  {
    kind: "task",
    name: "create_task",
    output: {
      objectType: "task",
      object: {
        id: "task-1",
        title: "Baca buku",
        status: "inbox",
        dueAt: "2026-10-08T15:59:00.000Z",
      },
    },
  },
  {
    kind: "reminder",
    name: "create_reminder",
    output: {
      reminders: [
        {
          id: "reminder-1",
          title: "Minum obat",
          scheduledAt: "2026-10-09T09:00:00.000Z",
          recurrence: { frequency: "weekly", interval: 1, daysOfWeek: [2, 4] },
        },
      ],
    },
  },
  {
    kind: "file",
    name: "send_file",
    output: {
      objectType: "file",
      object: {
        documentId: "document-1",
        filename: "Invoice.pdf",
        url: "http://localhost:5000/documents/document-1/content",
      },
    },
  },
  {
    kind: "event",
    name: "create_calendar_event",
    output: {
      objectType: "calendar_event",
      object: {
        id: "event-1",
        title: "Rapat tim",
        startAt: timestamp,
        endAt: "2026-10-08T09:00:00.000Z",
        timezone: "Asia/Makassar",
        status: "confirmed",
        location: "Kantor",
      },
    },
  },
] as const;

function invocation(
  id: string,
  name: string,
  output: ToolInvocation["output"]
): ToolInvocation {
  return {
    id,
    name,
    label: name,
    assistantRunId: "run-1",
    status: "completed",
    objectId: null,
    objectType: null,
    state: null,
    output,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

// API-shaped fixtures cross the same normalization boundary as real chat turns.
const invocations = records.map((record) =>
  invocation(
    record.kind,
    record.name,
    JSON.parse(JSON.stringify(record.output)) as ToolInvocation["output"]
  )
);

const content =
  "Tugas **Baca buku** dibuat untuk hari ini. Pengingat Minum obat dijadwalkan.\n\nBuka [Invoice.pdf](http://localhost:5000/documents/document-1/content). Acara Rapat tim tersimpan.\n\n`Baca buku` tetap berupa kode. [Baca buku](https://example.test) tetap berupa tautan.\n\n| Jenis | Item |\n| --- | --- |\n| Tugas | Baca buku |";

function CompactReminders() {
  const query = useQuery(remindersQueryOptions());

  return (
    <ul>
      {query.data?.map((reminder) => (
        <CompactReminderRow key={reminder.id} reminder={reminder} />
      ))}
    </ul>
  );
}

function Harness() {
  const [, refresh] = useState(0);
  useEffect(() => {
    const onRefresh = () => refresh((revision) => revision + 1);
    window.addEventListener("entity-fixture-refresh", onRefresh);

    return () =>
      window.removeEventListener("entity-fixture-refresh", onRefresh);
  }, []);
  const mode = new URLSearchParams(window.location.search).get("mode");
  if (mode === "reminders")
    return (
      <main className="p-6">
        <ReminderPage />
      </main>
    );
  if (mode === "compact-reminders") return <CompactReminders />;
  const sources = invocation("sources", "search_documents", {
    sources: [
      {
        documentId: "document-1",
        filename: "Invoice.pdf",
        page: 1,
        quote: "Invoice total: Rp 150.000",
      },
    ],
  });

  const message: ConversationMessage = {
    id: "answer-1",
    conversationId: "conversation-1",
    role: "assistant",
    content: mode === "fallback" ? "Tugas dibuat." : content,
    createdAt: timestamp,
    attachments: [],
  };

  const attachment: ConversationMessage = {
    id: "upload-1",
    conversationId: "conversation-1",
    role: "user",
    content: "Simpan file ini",
    createdAt: "2026-10-08T07:59:00.000Z",
    attachments: [
      {
        fileAsset: {
          id: "asset-1",
          originalName: "Invoice.pdf",
          mimeType: "application/pdf",
          size: 1234,
          kind: "document",
          document: { id: "document-1", title: "Invoice.pdf" },
        },
      },
    ],
  };

  return (
    <main className="min-h-screen bg-canvas">
      <MessageHistory
        messages={[attachment, message]}
        assistantRuns={[
          {
            id: "run-1",
            conversationId: "conversation-1",
            assistantMessageId: message.id,
            status: "completed",
            errorMessage: null,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ]}
        toolInvocations={
          mode === "fallback"
            ? invocations.slice(0, 1)
            : mode === "sources"
              ? [...invocations, sources]
              : [...invocations]
        }
        isSending={false}
        onRetry={() => {
          throw new Error("Fixture has no failed runs");
        }}
        locale={mode === "english" ? "en" : "id"}
        timezone="Asia/Makassar"
      />
    </main>
  );
}

function mount() {
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({
    queries: { retry: false },
    mutations: { retry: false },
  });

  const rootRoute = createRootRoute({ component: Harness });
  const calendar = createRoute({
    getParentRoute: () => rootRoute,
    path: "/calendar",
  });

  const reminders = createRoute({
    getParentRoute: () => rootRoute,
    path: "/reminders",
  });

  const index = createRoute({ getParentRoute: () => rootRoute, path: "/" });
  const router = createRouter({
    routeTree: rootRoute.addChildren([index, calendar, reminders]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  const container = document.getElementById("root");
  if (!container) throw new Error("Entity fixture root is missing");
  createRoot(container).render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

mount();
