import type { Persona } from '@/lib/schemas';

const W = 760;
const H = 150;

const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * The "cover" of a persona OS: a compact org chart — the operator core at the
 * top, their departments (pillars) on the bus below, and each department's
 * agents as dots. Tinted with the persona's accent. Pure SVG, scales to width.
 */
export function PersonaOrgChart({ persona }: { persona: Persona }) {
  const accent = persona.accent;
  const pillars = persona.pillars.slice(0, 5);
  const n = pillars.length;
  const margin = 80;
  const span = W - margin * 2;
  const colX = (i: number) => (n === 1 ? W / 2 : margin + (i / (n - 1)) * span);

  const rootCx = W / 2;
  const rootY = 14;
  const rootH = 24;
  const rootW = 150;
  const busY = 54;
  const pillarTop = 72;
  const pillarH = 26;
  const pillarW = 128;
  const agentBusY = 116;
  const agentY = 130;

  const gradId = `pcover-${persona.id}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="block h-[150px] w-full" role="img" aria-label={`${persona.name} org chart`}>
      <defs>
        <radialGradient id={gradId} cx="50%" cy="22%" r="60%">
          <stop offset="0%" stopColor={accent} stopOpacity="0.16" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width={W} height={H} fill={`url(#${gradId})`} />

      {/* connectors: root → bus → pillars (orthogonal, org-chart style) */}
      <g stroke={accent} strokeWidth="1.2" fill="none" opacity="0.5">
        <line x1={rootCx} y1={rootY + rootH} x2={rootCx} y2={busY} />
        <line x1={colX(0)} y1={busY} x2={colX(n - 1)} y2={busY} />
        {pillars.map((p, i) => (
          <line key={`drop-${i}`} x1={colX(i)} y1={busY} x2={colX(i)} y2={pillarTop} />
        ))}
      </g>

      {/* agents per pillar: pillar → mini-bus → dots */}
      {pillars.map((p, i) => {
        const k = p.agents.length;
        const gap = 14;
        const start = colX(i) - ((k - 1) * gap) / 2;
        return (
          <g key={`agents-${i}`}>
            <g stroke={accent} strokeWidth="1" fill="none" opacity="0.4">
              <line x1={colX(i)} y1={pillarTop + pillarH} x2={colX(i)} y2={agentBusY} />
              {k > 1 && <line x1={start} y1={agentBusY} x2={start + (k - 1) * gap} y2={agentBusY} />}
              {p.agents.map((_, j) => (
                <line key={j} x1={start + j * gap} y1={agentBusY} x2={start + j * gap} y2={agentY - 3} />
              ))}
            </g>
            {p.agents.map((_, j) => (
              <circle key={j} cx={start + j * gap} cy={agentY} r="3.2" fill="var(--surface)" stroke={accent} strokeWidth="1.3" />
            ))}
          </g>
        );
      })}

      {/* pillar nodes */}
      {pillars.map((p, i) => (
        <g key={`pillar-${i}`}>
          <rect
            x={colX(i) - pillarW / 2}
            y={pillarTop}
            width={pillarW}
            height={pillarH}
            rx="4"
            fill="var(--surface)"
            stroke={accent}
            strokeWidth="1.3"
            opacity="0.95"
          />
          <text x={colX(i)} y={pillarTop + pillarH / 2 + 3.5} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9.5" fontWeight={600} fill="var(--text)">
            {trunc(p.name, 17)}
          </text>
        </g>
      ))}

      {/* root: the operator OS core — surface node with an accent ring + a
          filled accent dot so it reads on any theme and stands out from pillars */}
      <g>
        <rect x={rootCx - rootW / 2} y={rootY} width={rootW} height={rootH} rx="5" fill="var(--surface)" stroke={accent} strokeWidth="2" />
        <circle cx={rootCx - rootW / 2 + 13} cy={rootY + rootH / 2} r="3.5" fill={accent} />
        <text x={rootCx + 6} y={rootY + rootH / 2 + 3.5} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10" fontWeight={700} fill={accent}>
          {trunc(persona.archetype, 20)}
        </text>
      </g>
    </svg>
  );
}
