import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  MessageCircle,
  SlidersHorizontal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_app/")({
  head: () => ({
    meta: [
      { title: "Today · Sydia" },
      { name: "description", content: "Your quiet Sydia control center." },
    ],
  }),
  component: TodayPage,
});

function TodayPage() {
  const user = Route.useRouteContext();
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;

  return (
    <div className="space-y-12">
      <header className="grid gap-8 border-b border-surface-1 pb-10 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="max-w-3xl space-y-4">
          <p className="font-mono text-xs tracking-widest text-link uppercase">
            Today / Control center
          </p>
          <h1 className="font-display text-5xl leading-[1.05] font-extrabold sm:text-6xl">
            Good to have you here, {firstName}.
          </h1>
          <p className="max-w-2xl text-lg text-ink-muted">
            This is where you inspect and correct what Sydia knows.
            Conversational work arrives in later phases; account context is
            ready now.
          </p>
        </div>
        <Badge dot="brand">Account ready</Badge>
      </header>

      <section
        aria-labelledby="readiness-title"
        className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]"
      >
        <Card variant="dark-accent" className="p-7 sm:p-8">
          <p className="font-mono text-xs tracking-widest text-brand uppercase">
            Foundation status
          </p>
          <h2
            id="readiness-title"
            className="mt-5 font-display text-3xl font-extrabold"
          >
            Your interpretation context is set.
          </h2>
          <ul className="mt-7 space-y-4 text-canvas/80">
            <li className="flex gap-3">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-brand" />
              <span>
                Timezone:{" "}
                <strong className="font-semibold text-canvas">
                  {user.timezone.replaceAll("_", " ")}
                </strong>
              </span>
            </li>
            <li className="flex gap-3">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-brand" />
              <span>
                Interface language:{" "}
                <strong className="font-semibold text-canvas">
                  {user.locale === "id" ? "Bahasa Indonesia" : "English"}
                </strong>
              </span>
            </li>
          </ul>
          <Button
            variant="dark-outline"
            className="mt-8"
            nativeButton={false}
            render={<Link to="/settings/profile" />}
          >
            <SlidersHorizontal />
            Review preferences
          </Button>
        </Card>

        <Card className="flex flex-col justify-between p-7 sm:p-8">
          <div>
            <MessageCircle className="size-6 text-brand-deep" />
            <h2 className="mt-5 font-display text-2xl font-bold">
              Conversation remains the capture surface.
            </h2>
            <p className="mt-3 text-ink-muted">
              This dashboard deliberately stays quiet until real assistant,
              task, and reminder data is available. No invented activity,
              charts, or status.
            </p>
          </div>
          <p className="mt-8 flex items-center gap-2 font-mono text-xs tracking-wider text-ink-weak uppercase">
            Phase 0–1 complete <ArrowRight className="size-4" />
          </p>
        </Card>
      </section>
    </div>
  );
}
