import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
  EyeOff,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LoadingState } from "@/components/app-states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { consumeSecretReveal } from "@/lib/services/api/secrets/secrets.api";
import { formatDateTime } from "@/lib/utils/date-time";
import { extractRevealToken } from "@/lib/utils/reveal-token";

const AUTO_HIDE_MS = 30_000;

type RevealState =
  | { status: "checking" }
  | { status: "missing" }
  | { status: "idle"; token: string }
  | { status: "revealing"; token: string }
  | { status: "revealed"; label: string; value: string; expiresAt: string }
  | { status: "hidden"; label: string }
  | { status: "error"; message: string; token: string };

export function SecretRevealPage() {
  const [state, setState] = useState<RevealState>({ status: "checking" });
  const [copied, setCopied] = useState(false);
  // Plaintext mirror kept outside React state so it can be scrubbed on
  // unmount; the revealed value itself never enters the query cache,
  // storage, or the URL.
  const valueRef = useRef<string | null>(null);

  useEffect(() => {
    const token = extractRevealToken(window.location.hash);
    if (window.location.hash)
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
      );
    const initialize = window.setTimeout(
      () => setState(token ? { status: "idle", token } : { status: "missing" }),
      0
    );

    return () => window.clearTimeout(initialize);
  }, []);

  useEffect(() => {
    if (state.status !== "revealed") return;
    const timeout = setTimeout(() => {
      valueRef.current = null;
      setState((current) =>
        current.status === "revealed"
          ? { status: "hidden", label: current.label }
          : current
      );
    }, AUTO_HIDE_MS);

    return () => clearTimeout(timeout);
  }, [state.status]);

  useEffect(
    () => () => {
      valueRef.current = null;
    },
    []
  );

  async function handleReveal(token: string) {
    setState({ status: "revealing", token });

    try {
      const revealed = await consumeSecretReveal(token);
      valueRef.current = revealed.value;
      setState({ status: "revealed", ...revealed });
    } catch (error) {
      valueRef.current = null;
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Tautan ini tidak dapat dibuka.",
        token,
      });
    }
  }

  async function copyValue() {
    const value = valueRef.current;
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  function hideValue() {
    valueRef.current = null;
    setState((current) =>
      current.status === "revealed"
        ? { status: "hidden", label: current.label }
        : current
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 py-16">
      <section className="w-full max-w-xl" aria-live="polite">
        {state.status === "checking" ? (
          <LoadingState label="Menyiapkan tautan…" />
        ) : null}

        {state.status === "missing" ? (
          <Card role="alert">
            <AlertTriangle className="mb-4 size-6 text-destructive" />
            <h1 className="font-display text-[26px] leading-[1.22] font-semibold tracking-[-0.018em]">
              Tautan tidak lengkap
            </h1>
            <p className="mt-2 text-ink-muted">
              Tautan ungkap ini tidak memuat token. Minta pengirim menyalin dan
              mengirim ulang tautan lengkapnya.
            </p>
          </Card>
        ) : null}

        {state.status === "idle" || state.status === "revealing" ? (
          <Card>
            <ShieldCheck className="mb-4 size-6 text-brand-deep" />
            <h1 className="font-display text-[26px] leading-[1.22] font-semibold tracking-[-0.018em]">
              Rahasia dibagikan kepada Anda
            </h1>
            <p className="mt-2 text-ink-muted">
              Seseorang membagikan rahasia terenkripsi melalui Sydia. Nilai
              hanya dapat ditampilkan satu kali — setelah Anda membukanya,
              tautan ini tidak berlaku lagi.
            </p>
            <Button
              className="mt-6"
              disabled={state.status === "revealing"}
              onClick={() => void handleReveal(state.token)}
            >
              {state.status === "revealing" ? (
                <LoaderCircle className="animate-spin motion-reduce:animate-none" />
              ) : (
                <Eye />
              )}
              {state.status === "revealing" ? "Membuka…" : "Tampilkan rahasia"}
            </Button>
          </Card>
        ) : null}

        {state.status === "revealed" ? (
          <Card>
            <p className="font-mono text-[13px] font-medium tracking-widest text-ink-muted uppercase">
              {state.label}
            </p>
            <div className="mt-4 rounded-md border border-ink/10 bg-surface-1 p-4">
              <p className="font-mono text-sm break-all whitespace-pre-wrap text-ink">
                {state.value}
              </p>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void copyValue()}
              >
                {copied ? <Check /> : <Copy />}
                {copied ? "Tersalin" : "Salin nilai"}
              </Button>
              <Button variant="ghost" size="sm" onClick={hideValue}>
                <EyeOff /> Sembunyikan sekarang
              </Button>
            </div>
            <p className="mt-4 text-sm text-ink-muted">
              Nilai disembunyikan otomatis setelah 30 detik. Tautan ini berlaku
              hingga {formatDateTime(state.expiresAt)} dan tidak dapat dibuka
              lagi.
            </p>
            <div aria-live="polite" className="sr-only">
              {copied ? "Nilai tersalin ke papan klip." : null}
            </div>
          </Card>
        ) : null}

        {state.status === "hidden" ? (
          <Card>
            <EyeOff className="mb-4 size-6 text-brand-deep" />
            <h1 className="font-display text-[26px] leading-[1.22] font-semibold tracking-[-0.018em]">
              Nilai telah disembunyikan
            </h1>
            <p className="mt-2 text-ink-muted">
              Rahasia “{state.label}” tidak lagi ditampilkan dan tautan ini
              tidak dapat digunakan kembali.
            </p>
          </Card>
        ) : null}

        {state.status === "error" ? (
          <Card role="alert">
            <AlertTriangle className="mb-4 size-6 text-destructive" />
            <h1 className="font-display text-[26px] leading-[1.22] font-semibold tracking-[-0.018em]">
              Tautan tidak dapat dibuka
            </h1>
            <p className="mt-2 text-ink-muted">{state.message}</p>
            <p className="mt-2 text-ink-muted">
              Jika tautan sudah kedaluwarsa atau sudah digunakan, minta pengirim
              membuat tautan ungkap baru.
            </p>
            <Button
              variant="secondary"
              className="mt-6"
              onClick={() => void handleReveal(state.token)}
            >
              Coba lagi
            </Button>
          </Card>
        ) : null}
      </section>
    </main>
  );
}
