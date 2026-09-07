import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminWhatsAppPage } from "@/components/settings/whatsapp-page";
import { requireAdminSession } from "@/lib/auth";

export const Route = createFileRoute("/admin_/whatsapp")({
  beforeLoad: ({ context, location }) =>
    requireAdminSession(context.queryClient, location.href),
  head: () => ({
    meta: [
      { title: "WhatsApp · Sydia Admin" },
      {
        name: "description",
        content: "Hubungkan dan pantau satu nomor WhatsApp layanan Sydia.",
      },
    ],
  }),
  component: AdminWhatsAppRoute,
});

function AdminWhatsAppRoute() {
  const admin = Route.useRouteContext();

  return (
    <AdminShell user={admin}>
      <AdminWhatsAppPage />
    </AdminShell>
  );
}
