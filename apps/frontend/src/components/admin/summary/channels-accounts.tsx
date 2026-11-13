import { percent, periodLabel, sum } from "../analytics/meta";
import { Card, SectionHeader } from "../analytics/widgets";
import { formatCount } from "../format";
import type { AdminSummary } from "../types";

type ChannelsAccountsProps = { data: AdminSummary };

const CHANNEL_LABELS: Record<string, string> = {
  web: "Web",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
};

/** Ink shades, darkest for the largest channel; labels carry the meaning. */
const CHANNEL_SHADES = ["#171419", "#6b6470", "#b8b1bc", "#dcd7de"];

export function channelLabel(channel: string): string {
  return CHANNEL_LABELS[channel] ?? channel;
}

type NewAccount = AdminSummary["newAccounts"][number];

export function accountStatus(account: NewAccount): string {
  if (account.messages > 0)
    return `Aktif · ${formatCount(account.features)} fitur`;

  return account.onboardingCompleted
    ? "Belum kirim pesan"
    : "Onboarding belum selesai";
}

function ChannelsCard({ data }: ChannelsAccountsProps) {
  const channels = [...data.channels].sort((a, b) => b.messages - a.messages);
  const total = sum(channels.map((entry) => entry.messages));

  return (
    <Card
      title="Kanal percakapan"
      description={`Sumber ${formatCount(total)} pesan pengguna`}
    >
      {total > 0 ? (
        <>
          <div
            aria-hidden="true"
            className="flex h-3 gap-0.5 overflow-hidden rounded-full"
          >
            {channels.map((entry, index) =>
              entry.messages > 0 ? (
                <span
                  key={entry.channel}
                  className="h-full"
                  style={{
                    width: `${(entry.messages / total) * 100}%`,
                    backgroundColor:
                      CHANNEL_SHADES[
                        Math.min(index, CHANNEL_SHADES.length - 1)
                      ],
                  }}
                />
              ) : null
            )}
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {channels.map((entry, index) => (
              <li
                key={entry.channel}
                className="grid grid-cols-[minmax(0,7rem)_1fr] items-baseline gap-x-3 gap-y-0.5 max-[420px]:grid-cols-1"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-[3px]"
                    style={{
                      backgroundColor:
                        CHANNEL_SHADES[
                          Math.min(index, CHANNEL_SHADES.length - 1)
                        ],
                    }}
                  />
                  <span className="truncate">
                    {channelLabel(entry.channel)}
                  </span>
                </span>
                <span className="font-mono text-[11px] text-ink-muted max-[420px]:pl-[18px]">
                  {formatCount(entry.messages)} pesan ·{" "}
                  {percent((entry.messages / total) * 100, 0)} ·{" "}
                  {formatCount(entry.users)} pengguna
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-ink-muted">
          Belum ada pesan pada periode ini.
        </p>
      )}
    </Card>
  );
}

function NewAccountsCard({ data }: ChannelsAccountsProps) {
  const accounts = data.newAccounts;
  const explored = accounts.filter((account) => account.features >= 3).length;

  return (
    <Card
      title="Akun baru"
      description={
        accounts.length
          ? `${formatCount(accounts.length)} akun · ${formatCount(explored)} sudah mencoba ≥3 fitur`
          : undefined
      }
    >
      {accounts.length ? (
        <ul className="space-y-2.5 text-sm">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="grid grid-cols-2 gap-x-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.3fr)]"
            >
              <span
                className="min-w-0 truncate font-medium"
                title={account.email}
              >
                {account.name}
              </span>
              <span className="min-w-0 truncate text-right text-ink-muted sm:text-left">
                {account.source ?? "Tidak diketahui"}
              </span>
              <span className="col-span-2 min-w-0 truncate text-xs text-ink-muted sm:col-span-1 sm:text-sm">
                {accountStatus(account)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">
          Belum ada akun baru pada periode ini.
        </p>
      )}
    </Card>
  );
}

export function ChannelsAccounts({ data }: ChannelsAccountsProps) {
  return (
    <section aria-labelledby="summary-channels">
      <SectionHeader
        id="summary-channels"
        title="Kanal & akun baru"
        meta={periodLabel(data.period).toLowerCase()}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <ChannelsCard data={data} />
        <NewAccountsCard data={data} />
      </div>
    </section>
  );
}
