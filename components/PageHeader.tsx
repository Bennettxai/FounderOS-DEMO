export function PageHeader({
  eyebrow,
  title,
  caret = false,
  right,
  rightWide = false,
}: {
  eyebrow?: string;
  title: string;
  caret?: boolean;
  right?: React.ReactNode;
  /** Let the `right` widget stretch wide across the header whitespace as a
      short bar tucked top-right, instead of sitting compact against the edge. */
  rightWide?: boolean;
}) {
  // No descriptions under titles — Alex built it, he knows what it does.
  return (
    <header className={`mb-6 flex justify-between gap-4 ${rightWide ? 'items-start' : 'items-end'}`}>
      <div className="min-w-0 shrink-0">
        {eyebrow && (
          <div className="page-eyebrow mb-2 flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.32em] text-os-dim">
            {eyebrow}
          </div>
        )}
        <h1 className={`text-[25px] font-bold uppercase leading-[1.1] tracking-[0.06em]${caret ? ' caret-blink' : ''}`}>
          {title}
        </h1>
      </div>
      {right && (
        <div className={rightWide ? 'flex min-w-0 flex-1 items-start' : 'flex shrink-0 items-center gap-2'}>
          {right}
        </div>
      )}
    </header>
  );
}
