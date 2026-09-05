function ClosingBand() {
  return (
    <footer className="relative overflow-hidden rounded-xl border border-surface-1 bg-canvas p-6 lg:p-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -bottom-40 size-96 rounded-full opacity-70"
        style={{
          background:
            "radial-gradient(closest-side, transparent 60%, rgba(50, 230, 226, 0.45) 78%, rgba(50, 230, 226, 0.1) 92%, transparent 100%)",
        }}
      />
      <div className="relative flex flex-wrap items-end justify-between gap-6">
        <div className="space-y-2">
          <p className="font-mono text-xs leading-[18px] text-ink-weak uppercase">
            Blok pembangun yang sama. Kemungkinan yang lebih cerah.
          </p>
          <p className="font-display text-4xl leading-10 font-extrabold text-ink">
            Lebih
            <br />
            mampu bersama Anda
          </p>
        </div>
        <ul className="space-y-1 text-right">
          {["Rencanakan", "Ciptakan", "Capai", "Bersama"].map((word) => (
            <li
              key={word}
              className="font-mono text-xs leading-[18px] tracking-widest text-ink-weak uppercase"
            >
              {word}
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}

export { ClosingBand };
