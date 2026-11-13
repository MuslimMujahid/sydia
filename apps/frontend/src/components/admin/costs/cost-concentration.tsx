import { cn } from "@/lib/utils/cn";
import type { AdminCostReport } from "../types";
import { Card } from "../analytics/widgets";
import { percent } from "../analytics/meta";
import { formatCount, formatUsd } from "../format";
import { formatUsdShort } from "./cost-format";
import { costConcentration } from "./cost-model";

type CostConcentrationProps = { data: AdminCostReport };

/** How few users carry most of the spend. */
export function CostConcentration({ data }: CostConcentrationProps) {
  const { rows, leaders, leadersShare } = costConcentration(data);
  const max = Math.max(...rows.map((row) => row.costUsd), 0);

  return (
    <Card
      title="Konsentrasi biaya"
      description={
        leaders > 0
          ? `${formatCount(leaders)} pengguna = ${percent(leadersShare, 0)} biaya periode ini`
          : "Belum ada biaya yang teratribusi ke pengguna"
      }
    >
      <table className="w-full table-fixed text-sm">
        <caption className="sr-only">
          Biaya per pengguna dan bagian kumulatifnya
        </caption>
        <thead>
          <tr className="text-[11px] text-ink-muted">
            <th scope="col" className="w-[34%] pb-2 text-left font-normal">
              <span className="sr-only">Pengguna</span>
            </th>
            <th scope="col" className="pb-2 text-left font-normal">
              <span className="sr-only">Biaya</span>
            </th>
            <th scope="col" className="w-16 pb-2 text-right font-normal">
              Kumulatif
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const leader = row.kind === "user" && index < leaders;

            return (
              <tr
                key={row.key}
                className={cn(
                  index === leaders - 1 &&
                    index < rows.length - 1 &&
                    "border-b border-ink/15"
                )}
              >
                <th
                  scope="row"
                  className={cn(
                    "truncate py-2 pr-3 text-left",
                    leader ? "font-semibold" : "font-normal",
                    row.kind !== "user" && "text-ink-muted"
                  )}
                  title={row.label}
                >
                  {row.label}
                </th>
                <td className="py-2">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "block h-2.5 shrink-0 rounded-[3px]",
                        leader
                          ? "bg-ink"
                          : row.kind === "pooled"
                            ? "bg-ink/12"
                            : "bg-ink/35"
                      )}
                      style={{
                        width: `${max > 0 ? Math.max((row.costUsd / max) * 70, 2) : 0}%`,
                      }}
                    />
                    <span className="font-mono text-[11px]">
                      {formatUsdShort(row.costUsd)}
                    </span>
                  </span>
                </td>
                <td
                  className={cn(
                    "py-2 text-right font-mono text-[11px]",
                    leader ? "font-semibold" : "text-ink-muted"
                  )}
                >
                  {percent(row.cumulative, 0)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-[11px] text-ink-muted">
        Tanpa pengguna = Hindsight gabungan {formatUsd(data.pooledMemoryUsd)} +
        tak teratribusi {formatUsd(data.unattributedUsd)}
      </p>
    </Card>
  );
}
