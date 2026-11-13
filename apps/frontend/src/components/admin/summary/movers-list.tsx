import { Link } from "@tanstack/react-router";
import { FEATURE_LABELS } from "../analytics/meta";
import { Card, DeltaChip } from "../analytics/widgets";
import { formatCount, formatUsd } from "../format";
import type { AdminMover, AdminPeriod } from "../types";
import { initials, signed, type Delta } from "./summary-format";

type MoversListProps = {
  movers: AdminMover[];
  period: AdminPeriod;
};

function reason(mover: AdminMover): string {
  switch (mover.kind) {
    case "cost": {
      const verb = mover.delta >= 0 ? "Biaya naik" : "Biaya turun";

      return mover.feature
        ? `${verb} · terbanyak di ${FEATURE_LABELS[mover.feature]}`
        : verb;
    }

    case "actions":
      return `${formatCount(mover.actions)} aksi vs ${formatCount(mover.previousActions)} sebelumnya`;
    case "new":
      return `Mulai aktif · ${formatCount(mover.actions)} aksi`;
  }
}

function moverDelta(mover: AdminMover): Delta {
  switch (mover.kind) {
    case "cost":
      return {
        direction: mover.delta >= 0 ? "up" : "down",
        tone: mover.delta >= 0 ? "warn" : "good",
        text: signed(mover.delta, formatUsd),
      };
    case "actions":
      return {
        direction: mover.delta >= 0 ? "up" : "down",
        tone: mover.delta >= 0 ? "good" : "neutral",
        text: `${signed(mover.delta, formatCount)} aksi`,
      };
    case "new":
      return { tone: "good", text: "Baru aktif" };
  }
}

/** Users whose spend or activity moved most against the previous window. */
export function MoversList({ movers, period }: MoversListProps) {
  if (!movers.length) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">Belum ada perubahan berarti.</p>
      </Card>
    );
  }

  return (
    <Card bodyClassName="py-1">
      <ul className="divide-y divide-ink/6">
        {movers.map((mover) => {
          const delta = moverDelta(mover);

          return (
            <li key={`${mover.userId}-${mover.kind}`}>
              <Link
                to="/admin/users"
                search={{ period, user: mover.userId }}
                className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3.5 outline-none hover:bg-ink/[0.03] focus-visible:ring-2 focus-visible:ring-brand"
              >
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-pink-50 text-[11px] font-semibold text-pink-700"
                >
                  {initials(mover.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {mover.name}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-ink-muted">
                    {reason(mover)}
                  </span>
                </span>
                <DeltaChip direction={delta.direction} tone={delta.tone}>
                  {delta.text}
                </DeltaChip>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
