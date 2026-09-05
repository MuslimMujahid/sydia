import { createFileRoute, Link } from "@tanstack/react-router";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_app/")({
  head: () => ({
    meta: [
      { title: "Hari ini · Sydia" },
      { name: "description", content: "Pusat kendali Sydia Anda yang tenang." },
    ],
  }),
  component: TodayPage,
});

function TodayPage() {
  const user = Route.useRouteContext();
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;

  return (
    <div className="max-w-4xl space-y-10">
      <header className="max-w-3xl space-y-4">
        <p className="font-mono text-xs tracking-widest text-link uppercase">
          Hari ini
        </p>
        <h1 className="font-display text-4xl leading-tight font-extrabold sm:text-5xl">
          Selamat datang, {firstName}.
        </h1>
        <p className="max-w-2xl text-lg text-ink-muted">
          Tinjau konteks yang digunakan Sydia untuk memahami waktu dan
          menampilkan antarmuka Anda.
        </p>
      </header>

      <section aria-labelledby="context-title">
        <Card variant="dark-accent" className="p-7 sm:p-8">
          <div className="max-w-3xl space-y-4">
            <p className="font-mono text-xs tracking-widest text-brand uppercase">
              Konteks saat ini
            </p>
            <h2
              id="context-title"
              className="font-display text-3xl font-extrabold"
            >
              Preferensi yang digunakan Sydia
            </h2>
          </div>
          <dl className="mt-7 divide-y divide-canvas/10 border-y border-canvas/10">
            <div className="grid gap-1 py-4 sm:grid-cols-[10rem_1fr] sm:gap-6">
              <dt className="text-sm text-canvas/60">Zona waktu</dt>
              <dd className="font-semibold text-canvas">
                {user.timezone.replaceAll("_", " ")}
              </dd>
            </div>
            <div className="grid gap-1 py-4 sm:grid-cols-[10rem_1fr] sm:gap-6">
              <dt className="text-sm text-canvas/60">Bahasa</dt>
              <dd className="font-semibold text-canvas">
                {user.locale === "id" ? "Bahasa Indonesia" : "Bahasa Inggris"}
              </dd>
            </div>
          </dl>
          <Button
            variant="dark-outline"
            className="mt-8"
            nativeButton={false}
            render={<Link to="/settings/profile" />}
          >
            <SlidersHorizontal />
            Tinjau preferensi
          </Button>
        </Card>
      </section>
    </div>
  );
}
