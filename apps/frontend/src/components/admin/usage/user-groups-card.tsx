import { Card } from "../analytics/widgets";
import { sum } from "../analytics/meta";
import { formatCount } from "../format";
import type { AdminUsageReport } from "../types";
import { USER_GROUPS } from "./usage-meta";

type UserGroupsCardProps = {
  groups: AdminUsageReport["groups"];
  totalAccounts: number;
};

/** One segmented bar of engagement groups with a definition per group. */
export function UserGroupsCard({ groups, totalAccounts }: UserGroupsCardProps) {
  const total = sum(USER_GROUPS.map(({ key }) => groups[key]));

  return (
    <Card
      title="Kelompok pengguna"
      description={`${formatCount(totalAccounts)} akun · menurut hari aktif dan jumlah fitur`}
    >
      <div
        role="img"
        aria-label={`Kelompok pengguna: ${USER_GROUPS.map(
          ({ key, label }) => `${label} ${formatCount(groups[key])}`
        ).join(", ")}`}
        className="flex h-3 gap-0.5 overflow-hidden rounded-[3px]"
      >
        {total > 0 ? (
          USER_GROUPS.filter(({ key }) => groups[key] > 0).map(
            ({ key, color }) => (
              <span
                key={key}
                className="h-full first:rounded-l-[3px] last:rounded-r-[3px]"
                style={{
                  flexGrow: groups[key],
                  flexBasis: 0,
                  backgroundColor: color,
                }}
              />
            )
          )
        ) : (
          <span className="h-full flex-1 bg-ink/6" />
        )}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
        {USER_GROUPS.map(({ key, label, definition, color }) => (
          <li key={key} className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: color }}
              />
              {label} · {formatCount(groups[key])}
            </p>
            <p className="mt-0.5 pl-4 text-[11px] leading-snug text-ink-muted">
              {definition}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
