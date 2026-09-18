'use client';

/**
 * The workflow builder: real CRUD, opened from /workflows' "New workflow"
 * button or a card's edit affordance . A glass overlay, same chrome language as
 * AgentPanel: name + trigger, steps composed one-by-one (title, detail, an
 * owner picked from the REAL agent roster, tools, an optional automation
 * note, and an optional branch-from + condition), a drafting chat strip
 * that fills the form for review (never auto-saves), Save (POST create /
 * PATCH update), and: in edit mode: a two-step confirm before Delete.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Sparkles, Trash2, X } from 'lucide-react';
import type { Workflow, WorkflowAutomationState, WorkflowOwnerKind } from '@/lib/schemas';
import { TOOL_BRANDS } from '@/lib/workflow-tool-brands';

type BuilderStep = {
  key: string;
  title: string;
  detail: string;
  ownerAgentId: string;
  /** used only when ownerKind is 'human': the builder's default path is
   *  picking a real agent, but an existing seeded/drafted workflow can carry
   *  a human step, and editing it must not silently discard that name. */
  ownerHumanName: string;
  ownerKind: WorkflowOwnerKind;
  hoursPerWeek: string;
  tools: string[];
  automationOn: boolean;
  automationTitle: string;
  automationState: WorkflowAutomationState;
  branchFromKey: string; // '' = none
  branchCondition: string;
};

const TOOL_IDS = Object.keys(TOOL_BRANDS).sort();

function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k${Date.now()}-${Math.random()}`;
}

function emptyStep(): BuilderStep {
  return {
    key: newKey(),
    title: '',
    detail: '',
    ownerAgentId: '',
    ownerHumanName: '',
    ownerKind: 'agent',
    hoursPerWeek: '0',
    tools: [],
    automationOn: false,
    automationTitle: '',
    automationState: 'live',
    branchFromKey: '',
    branchCondition: '',
  };
}

function stepsFromWorkflow(workflow: Workflow, agents: { id: string; name: string }[]): BuilderStep[] {
  const byName = new Map(agents.map((a) => [a.name, a.id]));
  const keyById = new Map(workflow.steps.map((s) => [s.id, s.id]));
  return workflow.steps.map((s) => ({
    key: keyById.get(s.id) ?? newKey(),
    title: s.title,
    detail: s.detail,
    ownerAgentId: byName.get(s.owner) ?? '',
    ownerHumanName: s.ownerKind === 'human' ? s.owner : '',
    ownerKind: s.ownerKind,
    hoursPerWeek: String(s.hoursPerWeek),
    tools: s.tools,
    automationOn: Boolean(s.automation),
    automationTitle: s.automation?.title ?? '',
    automationState: s.automation?.state ?? 'live',
    branchFromKey: s.branch?.from ?? '',
    branchCondition: s.branch?.condition ?? '',
  }));
}

export function WorkflowBuilder({
  agents,
  workflow,
  onClose,
}: {
  agents: { id: string; name: string }[];
  workflow: Workflow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const editing = workflow !== null;
  const [name, setName] = useState(workflow?.name ?? '');
  const [subtitle, setSubtitle] = useState(workflow?.subtitle ?? '');
  const [steps, setSteps] = useState<BuilderStep[]>(() =>
    workflow ? stepsFromWorkflow(workflow, agents) : [emptyStep()],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [chatPrompt, setChatPrompt] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatUnavailable, setChatUnavailable] = useState(false);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  function updateStep(key: string, patch: Partial<BuilderStep>) {
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function addStep() {
    setSteps((prev) => [...prev, emptyStep()]);
  }

  function removeStep(key: string) {
    setSteps((prev) => {
      const next = prev.filter((s) => s.key !== key);
      // Any step branching off the removed one loses that pointer rather
      // than silently referencing a step that no longer exists.
      return next.map((s) => (s.branchFromKey === key ? { ...s, branchFromKey: '', branchCondition: '' } : s));
    });
  }

  function toggleTool(key: string, tool: string) {
    setSteps((prev) =>
      prev.map((s) =>
        s.key === key ? { ...s, tools: s.tools.includes(tool) ? s.tools.filter((t) => t !== tool) : [...s.tools, tool] } : s,
      ),
    );
  }

  function agentName(agentId: string): string {
    return agents.find((a) => a.id === agentId)?.name ?? '';
  }

  function buildPayload() {
    const keys = steps.map((s) => s.key);
    return {
      name: name.trim(),
      subtitle: subtitle.trim(),
      steps: steps.map((s) => ({
        title: s.title.trim(),
        detail: s.detail.trim(),
        ownerKind: s.ownerKind,
        owner: s.ownerKind === 'agent' ? agentName(s.ownerAgentId) : s.ownerHumanName.trim(),
        hoursPerWeek: Number(s.hoursPerWeek) || 0,
        tools: s.tools,
        automation: s.automationOn ? { title: s.automationTitle.trim() || 'Automation', state: s.automationState, recoveredUsd: 0 } : null,
        branchFromIndex: s.branchFromKey ? keys.indexOf(s.branchFromKey) : null,
        branchCondition: s.branchFromKey ? s.branchCondition.trim() || null : null,
      })),
    };
  }

  function validate(): string | null {
    if (!name.trim()) return 'Give the workflow a name.';
    if (steps.length === 0) return 'A workflow needs at least one step.';
    for (const [i, s] of steps.entries()) {
      if (!s.title.trim()) return `Step ${i + 1} needs a title.`;
      if (!s.detail.trim()) return `Step ${i + 1} needs a short description.`;
      if (s.ownerKind === 'agent' && !s.ownerAgentId) return `Step ${i + 1} needs an owner.`;
      if (s.ownerKind === 'human' && !s.ownerHumanName.trim()) return `Step ${i + 1} needs an owner.`;
      if (s.branchFromKey && s.branchFromKey === s.key) return `Step ${i + 1} cannot branch from itself.`;
    }
    return null;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(editing ? `/api/workflows/${workflow!.id}` : '/api/workflows', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(typeof body?.error === 'string' ? body.error : `save failed (HTTP ${res.status})`);
      }
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!workflow) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/workflows/${workflow.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`delete failed (HTTP ${res.status})`);
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDeleteArmed(false);
    } finally {
      setDeleting(false);
    }
  }

  async function draft() {
    const prompt = chatPrompt.trim();
    if (!prompt) return;
    setChatBusy(true);
    setChatError(null);
    setChatUnavailable(false);
    try {
      const res = await fetch('/api/workflows/draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const body = await res.json();
      if (!body.ok) {
        setChatUnavailable(Boolean(body.unavailable));
        setChatError(body.error ?? 'drafting failed');
        return;
      }
      const draftData = body.draft as ReturnType<typeof buildPayload>;
      setName(draftData.name);
      setSubtitle(draftData.subtitle);
      const drafted: BuilderStep[] = draftData.steps.map(() => emptyStep());
      const keys = drafted.map((s) => s.key);
      draftData.steps.forEach((s, i) => {
        const matched = agents.find((a) => a.name.toLowerCase() === s.owner.toLowerCase());
        drafted[i] = {
          ...drafted[i],
          title: s.title,
          detail: s.detail,
          ownerKind: matched ? 'agent' : s.ownerKind,
          ownerAgentId: matched?.id ?? '',
          ownerHumanName: matched ? '' : s.owner,
          hoursPerWeek: String(s.hoursPerWeek),
          tools: s.tools,
          automationOn: Boolean(s.automation),
          automationTitle: s.automation?.title ?? '',
          automationState: s.automation?.state ?? 'live',
          branchFromKey: s.branchFromIndex != null ? keys[s.branchFromIndex] : '',
          branchCondition: s.branchCondition ?? '',
        };
      });
      setSteps(drafted);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : String(err));
    } finally {
      setChatBusy(false);
    }
  }

  return (
    <div
      className="agentpanel-backdrop fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{ background: 'rgba(3, 7, 6, 0.55)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="agentpanel-panel glass-panel relative flex w-full max-w-[820px] flex-col overflow-hidden"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={editing ? `Edit ${workflow!.name}` : 'New workflow'}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="pressable absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-full border border-[color-mix(in oklab, var(--text) 14%, transparent)] bg-black/30 text-os-dim hover:text-os-text"
        >
          <X className="h-4 w-4" />
        </button>

        <form onSubmit={submit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-7 py-7">
            <h2 className="pr-10 text-[18px] font-medium leading-tight">{editing ? 'Edit workflow' : 'New workflow'}</h2>

            {/* Drafting chat */}
            <section className="mt-5">
              <span className="glass-label">Draft it for you</span>
              <div className="mt-2.5 flex items-center gap-2">
                <input
                  value={chatPrompt}
                  onChange={(e) => setChatPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      draft();
                    }
                  }}
                  placeholder="Describe the workflow and I'll draft it…"
                  className="glass-chip w-full flex-1 border-none px-3.5 py-2.5 text-[13px] text-os-text outline-none placeholder:text-os-dim"
                />
                <button
                  type="button"
                  onClick={draft}
                  disabled={chatBusy || !chatPrompt.trim()}
                  className="pressable c-btn shrink-0"
                >
                  <Sparkles className="h-[13px] w-[13px]" /> {chatBusy ? 'Drafting…' : 'Draft'}
                </button>
              </div>
              {chatError && (
                <p className="mt-2 text-[12px] text-os-dim">
                  {chatUnavailable ? 'Drafting assistant unavailable: build manually.' : chatError}
                </p>
              )}
              <p className="mt-2 text-[11px] text-os-dim">Fills the form below for you to review: nothing saves until you hit Save.</p>
            </section>

            {/* Name / subtitle */}
            <section className="mt-6 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="glass-label">Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Renewal outreach"
                  className="glass-chip border-none px-3 py-2.5 text-[13px] text-os-text outline-none placeholder:text-os-dim"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="glass-label">Trigger / description</span>
                <input
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="What kicks this off, in one line"
                  className="glass-chip border-none px-3 py-2.5 text-[13px] text-os-text outline-none placeholder:text-os-dim"
                />
              </label>
            </section>

            {/* Steps */}
            <section className="mt-6">
              <div className="flex items-center justify-between">
                <span className="glass-label">Steps</span>
                <button type="button" onClick={addStep} className="pressable c-btn">
                  <Plus className="h-[12px] w-[12px]" /> Add step
                </button>
              </div>
              <div className="mt-3 flex flex-col gap-3">
                {steps.map((s, i) => (
                  <div key={s.key} className="glass-panel-violet flex flex-col gap-3 px-4 py-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10.5px] text-os-dim">step {i + 1}</span>
                      {steps.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeStep(s.key)}
                          aria-label={`Remove step ${i + 1}`}
                          className="pressable glass-chip grid h-6 w-6 place-items-center text-os-dim hover:text-os-text"
                        >
                          <X className="h-3 w-3" strokeWidth={1.8} />
                        </button>
                      )}
                    </div>

                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-[10.5px] text-os-dim">Title</span>
                        <input
                          value={s.title}
                          onChange={(e) => updateStep(s.key, { title: e.target.value })}
                          placeholder="What happens in this step"
                          className="glass-chip border-none px-2.5 py-2 text-[12.5px] text-os-text outline-none placeholder:text-os-dim"
                        />
                      </label>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10.5px] text-os-dim">Owner</span>
                        <div className="flex items-center gap-1.5">
                          <select
                            value={s.ownerKind}
                            onChange={(e) => updateStep(s.key, { ownerKind: e.target.value as WorkflowOwnerKind })}
                            className="glass-chip shrink-0 border-none px-2 py-2 text-[11.5px] text-os-text outline-none"
                            aria-label="Owner kind"
                          >
                            <option value="agent">Agent</option>
                            <option value="human">Human</option>
                          </select>
                          {s.ownerKind === 'agent' ? (
                            <select
                              value={s.ownerAgentId}
                              onChange={(e) => updateStep(s.key, { ownerAgentId: e.target.value })}
                              className="glass-chip min-w-0 flex-1 border-none px-2.5 py-2 text-[12.5px] text-os-text outline-none"
                            >
                              <option value="">Pick an agent…</option>
                              {agents.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              value={s.ownerHumanName}
                              onChange={(e) => updateStep(s.key, { ownerHumanName: e.target.value })}
                              placeholder="Person's name"
                              className="glass-chip min-w-0 flex-1 border-none px-2.5 py-2 text-[12.5px] text-os-text outline-none placeholder:text-os-dim"
                            />
                          )}
                        </div>
                      </div>
                    </div>

                    <label className="flex flex-col gap-1">
                      <span className="text-[10.5px] text-os-dim">Detail</span>
                      <textarea
                        value={s.detail}
                        onChange={(e) => updateStep(s.key, { detail: e.target.value })}
                        rows={2}
                        placeholder="One or two sentences: what actually happens here"
                        className="glass-chip resize-none border-none px-2.5 py-2 text-[12.5px] leading-relaxed text-os-text outline-none placeholder:text-os-dim"
                      />
                    </label>

                    <div className="grid gap-2.5 sm:grid-cols-[100px_1fr]">
                      <label className="flex flex-col gap-1">
                        <span className="text-[10.5px] text-os-dim">Hours / wk</span>
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={s.hoursPerWeek}
                          onChange={(e) => updateStep(s.key, { hoursPerWeek: e.target.value })}
                          className="glass-chip border-none px-2.5 py-2 text-[12.5px] text-os-text outline-none"
                        />
                      </label>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10.5px] text-os-dim">Tools</span>
                        <div className="flex flex-wrap gap-1.5">
                          {TOOL_IDS.map((t) => {
                            const on = s.tools.includes(t);
                            return (
                              <button
                                key={t}
                                type="button"
                                onClick={() => toggleTool(s.key, t)}
                                className={`pressable rounded-full border px-2 py-[3px] text-[10.5px] ${
                                  on
                                    ? 'border-[var(--accent-line)] bg-[var(--accent-soft)] text-os-accent'
                                    : 'border-os-border text-os-dim hover:text-os-muted'
                                }`}
                              >
                                {TOOL_BRANDS[t].name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-2.5 sm:grid-cols-[auto_1fr_1fr]">
                      <label className="flex items-center gap-2 text-[11.5px] text-os-dim">
                        <input
                          type="checkbox"
                          checked={s.automationOn}
                          onChange={(e) => updateStep(s.key, { automationOn: e.target.checked })}
                        />
                        Automated
                      </label>
                      {s.automationOn && (
                        <>
                          <input
                            value={s.automationTitle}
                            onChange={(e) => updateStep(s.key, { automationTitle: e.target.value })}
                            placeholder="What the automation does"
                            className="glass-chip border-none px-2.5 py-2 text-[12px] text-os-text outline-none placeholder:text-os-dim"
                          />
                          <select
                            value={s.automationState}
                            onChange={(e) => updateStep(s.key, { automationState: e.target.value as WorkflowAutomationState })}
                            className="glass-chip border-none px-2.5 py-2 text-[12px] text-os-text outline-none"
                          >
                            <option value="live">Live</option>
                            <option value="suggested">Suggested</option>
                          </select>
                        </>
                      )}
                    </div>

                    {i > 0 && (
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-[10.5px] text-os-dim">Branches from (optional)</span>
                          <select
                            value={s.branchFromKey}
                            onChange={(e) => updateStep(s.key, { branchFromKey: e.target.value })}
                            className="glass-chip border-none px-2.5 py-2 text-[12.5px] text-os-text outline-none"
                          >
                            <option value="">No: continues the sequence</option>
                            {steps.slice(0, i).map((prior, j) => (
                              <option key={prior.key} value={prior.key}>
                                step {j + 1}{prior.title ? `: ${prior.title}` : ''}
                              </option>
                            ))}
                          </select>
                        </label>
                        {s.branchFromKey && (
                          <label className="flex flex-col gap-1">
                            <span className="text-[10.5px] text-os-dim">Condition</span>
                            <input
                              value={s.branchCondition}
                              onChange={(e) => updateStep(s.key, { branchCondition: e.target.value })}
                              placeholder='e.g. "approved", "went quiet"'
                              className="glass-chip border-none px-2.5 py-2 text-[12.5px] text-os-text outline-none placeholder:text-os-dim"
                            />
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {error && (
              <p className="mt-4 flex items-center gap-2 text-[12.5px] text-os-muted">
                <span className="dot err" />
                {error}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[color-mix(in oklab, var(--text) 10%, transparent)] px-6 py-4">
            <div>
              {editing && (
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="pressable flex items-center gap-1.5 rounded-sm-t border border-[color-mix(in_oklab,var(--err)_35%,transparent)] bg-[color-mix(in_oklab,var(--err)_9%,transparent)] px-3 py-2 text-[12.5px] text-os-err "
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deleting ? 'Deleting…' : deleteArmed ? 'Really delete? Click again' : 'Delete workflow'}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="pressable c-btn">
                Cancel
              </button>
              <button type="submit" disabled={busy} className="pressable c-btn c-btn-primary">
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>

      <style>{`
        .agentpanel-backdrop { animation: agentpanel-fade 0.2s ease-out both; }
        .agentpanel-panel { animation: agentpanel-in 0.2s ease-out both; }
        @keyframes agentpanel-fade { from { opacity: 0; } }
        @keyframes agentpanel-in { from { opacity: 0; transform: scale(0.97); } }
        @media (prefers-reduced-motion: reduce) {
          .agentpanel-backdrop, .agentpanel-panel { animation: none; }
        }
      `}</style>
    </div>
  );
}
