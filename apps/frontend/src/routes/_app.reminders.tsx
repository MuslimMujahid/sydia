import { createFileRoute } from "@tanstack/react-router";
import { ReminderPage } from "@/components/reminders/reminder-page";

export const Route = createFileRoute("/_app/reminders")({
  head: () => ({
    meta: [
      { title: "Pengingat · Sydia" },
      {
        name: "description",
        content: "Kelola pengingat satu kali dan berulang Anda.",
      },
    ],
  }),
  component: ReminderPage,
});
