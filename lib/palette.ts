export type Command = {
  id: string;
  label: string;
  keywords: string;
  href: string;
  hint?: string;
};

/**
 * Every whitespace-separated term must match label or keywords. Results are
 * ranked: label prefix > label substring > keyword-only match.
 */
export function filterCommands(commands: Command[], query: string): Command[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return commands;

  const scored: { command: Command; score: number }[] = [];
  for (const command of commands) {
    const label = command.label.toLowerCase();
    const haystack = `${label} ${command.keywords.toLowerCase()}`;
    if (!terms.every((t) => haystack.includes(t))) continue;
    let score = 0;
    for (const term of terms) {
      if (label.startsWith(term)) score += 3;
      else if (label.includes(term)) score += 2;
      else score += 1;
    }
    scored.push({ command, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.command);
}
