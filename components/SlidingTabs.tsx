'use client';

/** Tab strip whose selection indicator slides between fixed-width tabs, so the
    active marker never jumps. Underline for page tabs, pill for segmented. */
export function SlidingTabs<T extends string>({
  tabs,
  value,
  onChange,
  variant = 'underline',
  tabWidth = 120,
}: {
  tabs: { id: T; label: React.ReactNode; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  variant?: 'underline' | 'pill';
  tabWidth?: number;
}) {
  const i = Math.max(0, tabs.findIndex((t) => t.id === value));
  const pill = variant === 'pill';
  return (
    <div
      className={`relative grid ${pill ? 'rounded-[8px] border border-os-border bg-os-bg p-[3px]' : 'border-b border-os-border'}`}
      style={{ gridTemplateColumns: `repeat(${tabs.length}, ${tabWidth}px)` }}
      role="tablist"
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute transition-transform duration-lens ease-lens ${
          pill ? 'bottom-[3px] left-[3px] top-[3px] rounded-[5px] bg-os-surface2' : '-bottom-px left-0 h-[2px] bg-os-text'
        }`}
        style={{ width: tabWidth, transform: `translateX(${i * tabWidth}px)` }}
      />
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            data-lens="c"
            onClick={() => onChange(t.id)}
            className={`pressable relative inline-flex h-[30px] items-center justify-center gap-1.5 bg-transparent font-mono text-[10.5px] font-bold uppercase tracking-[.18em] hover:scale-[1.04] hover:shadow-none ${
 active ? 'text-os-text' : 'text-os-dim hover:text-os-muted'
 }`}
          >
            {t.label}
            {t.count != null && (
              <span
                className={`px-1.5 text-[9.5px] leading-[15px] tracking-normal ${
                  active ? 'bg-os-text text-os-ink' : 'bg-os-surface text-os-dim'
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
