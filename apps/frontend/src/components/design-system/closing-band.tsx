function ClosingBand() {
  return (
    <footer className="relative overflow-hidden rounded-lg border border-ink/6 bg-canvas p-6 shadow-card lg:p-8">
      <div className="relative flex flex-wrap items-end justify-between gap-6">
        <div className="space-y-2">
          <p className="font-mono text-xs leading-[18px] text-ink-weak uppercase">
            Blok pembangun yang sama. Kemungkinan yang lebih cerah.
          </p>
          <p className="font-display text-[26px] leading-[1.22] font-semibold tracking-[-0.018em] text-ink">
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
