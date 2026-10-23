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
import { AssistantMarkdown } from "../src/components/chat/assistant-markdown";
import { EntityPill } from "../src/components/chat/entity-pill";
import { collectChatEntities } from "../src/components/chat/chat-entities";
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

const allDayInvocation = invocation("all-day", "create_calendar_event", {
  objectType: "calendar_event",
  object: {
    id: "event-all-day",
    title: "Libur tim",
    status: "confirmed",
    startAt: null,
    endAt: null,
    timezone: null,
    allDayStartDate: "2026-10-20T00:00:00.000Z",
    allDayEndDate: "2026-10-23T00:00:00.000Z",
  },
});

// Snapshot of the task formatter's Indonesian web receipt. Metadata remains
// ordinary message text; only saved task names become interactive entity pills.
const taskReceipt =
  "Siap, tugasnya sudah dibuat.\n\n- **Baca buku** — Tenggat 8 Okt 2026, 23.59 · Prioritas tinggi";

const taskBatchReceipt =
  "Siap, 3 tugas sudah dibuat.\n\n- **Baca buku** — Tenggat 8 Okt 2026, 23.59 · Prioritas tinggi\n- **Kirim proposal** — Tenggat 9 Okt 2026, 11.00\n- **Beli perlengkapan kantor**";

// Representative model response following the task-list system policy.
const taskList =
  "Ada 3 tugas yang belum selesai:\n\n- [Baca buku](#task/task-1) — Tenggat 8 Okt 2026, 23.59 · Prioritas tinggi · Sedang dikerjakan\n- [Kirim proposal](#task/task-2) — Tenggat 9 Okt 2026, 11.00\n- [Beli perlengkapan kantor](#task/task-3)";

const taskListInvocations = [
  invocation("list-tasks", "list_tasks", {
    tasks: [
      { ...records[0].output.object, status: "inbox", priority: "high" },
      { ...records[0].output.object, id: "task-old", status: "done" },
      {
        id: "task-2",
        title: "Kirim proposal",
        status: "inbox",
        dueAt: "2026-10-09T03:00:00.000Z",
        priority: "medium",
      },
      {
        id: "task-3",
        title: "Beli perlengkapan kantor",
        status: "inbox",
        dueAt: null,
        priority: "medium",
      },
    ],
  }),
];

const taskReceiptInvocations = [
  invocation("receipt-task-1", "create_task", {
    objectType: "task",
    object: { ...records[0].output.object, priority: "high" },
  }),
  invocation("receipt-task-2", "create_task", {
    objectType: "task",
    object: {
      id: "task-2",
      title: "Kirim proposal",
      status: "inbox",
      dueAt: "2026-10-09T03:00:00.000Z",
      priority: "medium",
    },
  }),
  invocation("receipt-task-3", "create_task", {
    objectType: "task",
    object: {
      id: "task-3",
      title: "Beli perlengkapan kantor",
      status: "inbox",
      dueAt: null,
      priority: "medium",
    },
  }),
];

const compactReminder = {
  id: "reminder-1",
  title: "Minum obat",
  scheduledAt: "2026-10-13T09:00:00.000Z",
  timezone: "Asia/Makassar",
  recurrence: { frequency: "weekly", interval: 1, daysOfWeek: [2, 4] },
};

const compactFile = {
  id: "document-1",
  filename: "Invoice.pdf",
  mimeType: "application/pdf",
  size: 153600,
  status: "ready",
};

const compactContact = {
  id: "contact-1",
  name: "Bu Rina",
  email: "rina@example.test",
  phone: "+62 811 000",
  groups: [{ id: "group-1", name: "Teman Kerja" }],
};

const compactGroup = { id: "group-1", name: "Teman Kerja", contactCount: 2 };

// Snapshots of compact mutation receipts, and a representative model list reply.
const compactRows = [
  "- **Minum obat** — Pada 13 Okt 2026, 17.00 · mingguan pada Selasa, Kamis",
  "- **Rapat tim** — 8 Okt 2026, 16.00–17.00 · Kantor",
  "- **Invoice.pdf** — PDF · 150 KB",
  "- **Bu Rina** — rina@example.test · +62 811 000 · Grup: Teman Kerja",
  "- **Teman Kerja** — 2 kontak",
];

const compactReceipts = [
  `Siap, pengingatnya sudah dibuat.\n\n${compactRows[0]}`,
  `Siap, acaranya sudah dibuat.\n\n${compactRows[1]}`,
  `Siap, filenya sudah disimpan.\n\n${compactRows[2]}`,
  `Siap, kontaknya sudah disimpan.\n\n${compactRows[3]}`,
  `Siap, grup kontaknya sudah diperbarui.\n\n${compactRows[4]}`,
].join("\n\n");

const compactLists = [
  `Ada 1 pengingat:\n\n${compactRows[0]}`,
  `Ada 1 acara:\n\n${compactRows[1]}`,
  `Ada 1 file:\n\n${compactRows[2]}`,
  `Ada 1 kontak:\n\n${compactRows[3]}`,
  `Ada 1 grup kontak:\n\n${compactRows[4]}`,
].join("\n\n");

const compactReceiptInvocations = [
  invocation("compact-reminder", "create_reminder", {
    reminders: [compactReminder],
  }),
  invocation("compact-event", "create_calendar_event", records[3].output),
  invocation("compact-file", "save_attached_files", {
    objectType: "documents",
    objects: [compactFile],
  }),
  invocation("compact-contact", "save_contact", {
    objectType: "contact",
    object: compactContact,
  }),
  invocation("compact-group", "update_contact_group", {
    objectType: "contact_group",
    object: compactGroup,
  }),
];

const compactListInvocations = [
  invocation("list-reminders", "list_reminders", {
    reminders: [
      {
        id: compactReminder.id,
        title: compactReminder.title,
        date: "2026-10-13",
        time: "17:00",
        weekday: "Tuesday",
        recurrence: compactReminder.recurrence,
      },
    ],
  }),
  invocation("list-events", "list_calendar_events", {
    events: [records[3].output.object],
  }),
  invocation("list-files", "list_documents", { documents: [compactFile] }),
  invocation("list-contacts", "list_contacts", { contacts: [compactContact] }),
  invocation("list-groups", "list_contact_groups", {
    contactGroups: [compactGroup],
  }),
];

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

  if (mode === "mixed-items") {
    const entities = collectChatEntities([
      invocations[0]!,
      invocation("mixed-event", "create_calendar_event", {
        object: { ...records[3].output.object, title: "Review Aurora" },
      }),
      invocation("mixed-reminder", "create_reminder", {
        reminders: [{ ...compactReminder, title: "Review Aurora" }],
      }),
    ]).entities;

    return (
      <main className="mx-auto max-w-xl p-4">
        <AssistantMarkdown
          locale="id"
          timezone="Asia/Makassar"
          snapshotOnly
          entities={entities}
          content={
            "Ketiganya sudah dibuat.\n\n- [Baca buku](#task/task-1) — Tenggat 25 Okt 2026, 23.59\n- [Review Aurora](#event/event-1) — 29 Okt 2026, 10.00–11.00 · sinkronisasi tertunda\n- [Review Aurora](#reminder/reminder-1) — 29 Okt 2026, 08.00\n\nDetail [Review Aurora](#event/event-1)."
          }
        />
      </main>
    );
  }

  if (mode === "all-day-preview") {
    const entity = collectChatEntities([allDayInvocation]).entities[0];
    if (!entity)
      throw new Error("All-day fixture could not become a chat reference");

    return (
      <main className="p-6">
        <EntityPill
          entity={entity}
          locale="id"
          timezone="America/Los_Angeles"
          snapshotOnly
        />
      </main>
    );
  }

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
    content:
      mode === "all-day"
        ? "Siap, acara **Libur tim** disimpan untuk 20–22 Oktober 2026."
        : mode === "compact-receipts"
          ? compactReceipts
          : mode === "compact-lists"
            ? compactLists
            : mode === "task-receipt"
              ? taskReceipt
              : mode === "task-batch"
                ? taskBatchReceipt
                : mode === "task-list"
                  ? taskList
                  : mode === "fallback"
                    ? "Tugas dibuat."
                    : content,
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
          mode === "all-day"
            ? [allDayInvocation]
            : mode === "compact-receipts"
              ? compactReceiptInvocations
              : mode === "compact-lists"
                ? compactListInvocations
                : mode === "task-receipt"
                  ? taskReceiptInvocations.slice(0, 1)
                  : mode === "task-batch"
                    ? taskReceiptInvocations
                    : mode === "task-list"
                      ? taskListInvocations
                      : mode === "fallback"
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
