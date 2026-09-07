import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SettingsNav } from "@/components/settings/settings-nav";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
      <SettingsNav />
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
