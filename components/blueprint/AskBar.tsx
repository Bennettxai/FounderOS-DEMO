'use client';

import { forwardRef, useImperativeHandle, useRef, useState, type CSSProperties } from 'react';
import { Send, X } from 'lucide-react';
import type { HAny, HKind } from '@/lib/blueprint/hierarchy';

export interface AskHandle {
  focus: () => void;
  isFocused: () => boolean;
}

const SUGGEST: Partial<Record<HKind | '_general' | 'container' | 'group' | 'default', string[]>> = {
  _general: ['What is not wired yet?', 'Which agents actually run, and on what?', 'Where does the OS depend on one thing?'],
  agent: ['What does {n} do, and is it wired?', 'Which connectors and models does {n} depend on?', 'Why is {n} marked the way it is?'],
  daemon: ['What breaks if {n} stops?', 'What does {n} read and write?', 'Who approves what {n} sends?'],
  skill: ['Which agents load {n}?', 'What would improve {n}?'],
  connector: ['Is {n} configured here?', 'Which agents use {n}?', 'What would it take to make {n} live?'],
  model: ['What routes to {n}?', 'Is {n} the only path, or is there a fallback?'],
  store: ['Who reads and writes {n}?', 'What page shows {n}?'],
  department: ['Which agents in {n} actually run?', 'What is missing in {n}?'],
  group: ['Summarise {n} in three lines.', 'What in {n} is not configured?'],
  container: ['Summarise what runs on {n}.', 'What is the biggest risk on {n}?'],
  machine: ['Summarise what runs on {n}.', 'What is the biggest risk on {n}?'],
  operator: ['What do I touch directly, and what runs without me?', 'Where am I the single point of failure?'],
  command: ['What runs on {n}?', 'What happens if {n} is missing?'],
  app: ['Summarise the OS in three lines.', 'What in the OS is designed but not wired?'],
  router: ['What does {n} decide?', 'What lands on each side of {n}?'],
  surface: ['What does {n} read?', 'Which agents feed {n}?'],
  person: ['What does {n} own?', 'Which agents work beside {n}?'],
  cloud: ['What depends on {n}?', 'What happens if {n} is unavailable?'],
  default: ['What is {n} and what is it connected to?', 'What is wrong with {n}?'],
};

type Answer = { state: 'thinking'; text: string } | { state: 'ok'; text: string; model: string | null; scope: string } | { state: 'error'; text: string };

/**
 * The ask bar: AdPilot's frosted glass with the orbiting light, docked at
 * the bottom of the map. It knows what is selected: the scope chip takes
 * the selection's kind colour, the suggested questions change with it -
 * and the answer is grounded server-side in that scope's chain, members
 * and relations. `/` focuses it.
 */
export const AskBar = forwardRef<AskHandle, { scope: HAny | null; onClearScope: () => void }>(function AskBar({ scope, onClearScope }, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus(), isFocused: () => document.activeElement === inputRef.current }), []);

  const kindKey: keyof typeof SUGGEST = scope ? (scope.type === 'container' ? (scope.kind === 'machine' ? 'machine' : 'container') : scope.type === 'group' ? (scope.kind === 'department' ? 'department' : 'group') : scope.kind) : '_general';
  const chips = (SUGGEST[kindKey] ?? SUGGEST.default ?? []).map((q) => q.replace('{n}', scope ? scope.name : ''));
  const style = scope ? ({ '--sc': `var(--bh-k-${scope.kind}, var(--accent))` } as CSSProperties) : undefined;

  async function ask(question?: string) {
    const q = (question ?? value).trim();
    if (q.length < 3 || busy) return;
    setBusy(true);
    setAnswer({ state: 'thinking', text: scope ? `Looking at ${scope.name}, its members and its connections…` : 'Looking at the whole map…' });
    try {
      const r = await fetch('/api/blueprint/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: q, selected: scope?.id ?? null }) });
      const j = (await r.json()) as { ok: boolean; text?: string; model?: string | null; scope?: string; error?: string };
      if (!j.ok) setAnswer({ state: 'error', text: j.error || 'No answer.' });
      else setAnswer({ state: 'ok', text: j.text ?? '', model: j.model ?? null, scope: j.scope ?? (scope ? scope.name : 'whole system') });
    } catch (e) {
      setAnswer({ state: 'error', text: `Could not reach the analyst: ${(e as Error).message}` });
    }
    setBusy(false);
    setValue('');
  }

  return (
    <div className={`bh-ask ${scope ? 'has-scope' : 'has-chips'} ${busy ? 'is-busy' : ''}`} style={style}>
      <div className="bh-ask-orbit" aria-hidden="true" />
      <div className="bh-ask-glass" />
      <div className="bh-ask-inner">
        <div className="bh-ask-row">
          <button type="button" className="pressable bh-ask-scope" title={scope ? 'Clear selection (esc)' : 'Ask about the whole system'} onClick={() => (scope ? onClearScope() : inputRef.current?.focus())}>
            <i className="sw" />
            <span>{scope ? `Ask about ${scope.name}` : 'Ask Founder OS'}</span>
          </button>
          <input
            ref={inputRef}
            type="text"
            value={value}
            placeholder={scope ? `ask about ${scope.name}…` : 'ask anything about the system…'}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void ask();
              if (e.key === 'Escape') inputRef.current?.blur();
            }}
          />
          <button type="button" className="pressable bh-ask-send" aria-label="Ask" onClick={() => void ask()}>
            <Send />
          </button>
        </div>
        <div className="bh-ask-chips">
          {chips.map((q) => (
            <button key={q} type="button" className="pressable bh-ask-chip" onClick={() => void ask(q)}>
              {q}
            </button>
          ))}
        </div>
        {answer && (
          <div className={`bh-ask-answer is-on ${answer.state === 'thinking' ? 'is-thinking' : answer.state === 'error' ? 'is-error' : ''}`}>
            <div>{answer.text}</div>
            {answer.state === 'ok' && (
              <div className="meta">
                <span>
                  scope: {answer.scope}
                  {answer.model ? ` · ${answer.model}` : ''}
                </span>
                <button className="pressable" type="button" onClick={() => setAnswer(null)}>
                  <X /> clear
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
