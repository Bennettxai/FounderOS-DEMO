'use client';

/**
 * Workflows as a grid of trees (replaces the horizontal-scroll * WorkflowLines chain: the operator: "hard to read and cluttered... maybe like a * really nice tree for each of these and then we can click into them to * kind of expand them"). Upgraded for real branching, an openable
 * step-detail drawer, and a workflow builder (CRUD + a drafting chat) -
 * the operator: "the actual workflows look extremely lackluster... some of them
 * might have flow charts, not all of them are linear... you need to be able
 * to open these and view them in more detail... this has to actually work."
 *
 * Collapsed: a glass card with a compact horizontal mini-tree fingerprint.
 * Click it and it expands in place into the full vertical tree: one richer
 * glass node per step (icon in a tinted circle, owner avatar + name, the
 * automation/tool row, a tone-colored status hairline), hairline connectors,
 * and real forks: a step whose `branch` field names a prior step's id fans
 * out beside its siblings with the branch condition labeled on the
 * connector. Clicking a step node opens its full detail in a side drawer
 * within the expanded card. Only one workflow is expanded at a time; Esc,
 * the close button, or a click outside the expanded card collapses it.
 *
 * Honest: every figure comes from the workflow rows (workflowStats) and the
 * tree structure comes straight from `buildWorkflowTree` + `workflowStepParent`
 *: no invented steps, no invented branches. Two seeded workflows carry a
 * real fork today (see lib/seed.ts); this component makes no assumption
 * that every workflow is a straight spine.
 */

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Bot, CircleDashed, Pencil, Plus, User, X, Zap, type LucideIcon } from 'lucide-react';
import type { AgentRun, Workflow, WorkflowStep } from '@/lib/schemas';
import { workflowStats } from '@/lib/workflow-stats';
import { toolBrand } from '@/lib/workflow-tool-brands';
import { buildWorkflowTree, workflowStepParent, workflowToolIds, type WorkflowTreeNode } from '@/app/workflows/tree';
import { AgentAvatar } from '@/components/AgentAvatar';
import { WorkflowBuilder } from '@/components/WorkflowBuilder';

export type AgentPresence = 'active' | 'inactive';
export type SimpleAgent = { id: string; name: string };
/** null when a target has no builder open; 'new' opens the create flow. */
type BuilderTarget = 'new' | Workflow | null;

function stepTone(step: WorkflowStep): { color: string; word: string } {
  if (step.ownerKind === 'human') return { color: 'var(--text-2)', word: 'human step' };
  if (step.automation?.state === 'live') return { color: 'var(--accent)', word: 'automated · live' };
  if (step.automation?.state === 'suggested') return { color: 'var(--warn)', word: 'automation planned' };
  return { color: 'var(--text-2)', word: 'agent step' };
}

function stepIcon(step: WorkflowStep): LucideIcon {
  if (step.ownerKind === 'human') return User;
  if (step.automation?.state === 'suggested') return CircleDashed;
  if (step.automation?.state === 'live') return Zap;
  return Bot;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function WorkflowTree({
  workflows,
  toolLogos,
  agentPresence,
  agents,
  avatarByOwner,
  runsByOwner,
}: {
  workflows: Workflow[];
  toolLogos: Record<string, ReactNode>;
  agentPresence: Record<string, AgentPresence>;
  agents: SimpleAgent[];
  avatarByOwner: Record<string, string | null>;
  runsByOwner: Record<string, AgentRun[]>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [builderTarget, setBuilderTarget] = useState<BuilderTarget>(null);
  const expandedRef = useRef<HTMLDivElement>(null);

  // Switching which workflow is expanded (or collapsing) always drops any
  // open step detail: a stale selection from the last card must never
  // silently carry over.
  useEffect(() => {
    setSelectedStepId(null);
  }, [expandedId]);

  useEffect(() => {
    if (!expandedId) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      // Escape closes the nearer thing first: the step drawer, then the card.
      setSelectedStepId((current) => {
        if (current) return null;
        setExpandedId(null);
        return current;
      });
    }
    // Capture phase, and `click` rather than `mousedown`: this runs before
    // the clicked card's own onClick (which lives in the bubble phase), but
    //: critically: within the SAME event dispatch, before React has a
    // chance to re-render and reflow the grid. A mousedown-based collapse
    // would close this card, reflow the grid out from under the pointer,
    // and make the second card's click land on empty space instead of
    // opening it. Because both setState calls land in one batch here,
    // clicking a different (collapsed) card swaps the expansion cleanly.
    function onCapturedClick(e: MouseEvent) {
      if (expandedRef.current && !expandedRef.current.contains(e.target as Node)) {
        setExpandedId(null);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('click', onCapturedClick, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('click', onCapturedClick, true);
    };
  }, [expandedId]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-[12.5px] text-os-dim">
          {workflows.length} workflow{workflows.length === 1 ? '' : 's'} mapped
        </span>
        <button type="button" onClick={() => setBuilderTarget('new')} className="pressable c-btn c-btn-primary">
          <Plus className="h-[13px] w-[13px]" strokeWidth={2} /> New workflow
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {workflows.map((wf) => {
          const expanded = expandedId === wf.id;
          return (
            <WorkflowCard
              key={wf.id}
              wf={wf}
              expanded={expanded}
              cardRef={expanded ? expandedRef : undefined}
              onOpen={() => setExpandedId(wf.id)}
              onClose={() => setExpandedId(null)}
              onEdit={() => setBuilderTarget(wf)}
              toolLogos={toolLogos}
              agentPresence={agentPresence}
              avatarByOwner={avatarByOwner}
              runsByOwner={runsByOwner}
              selectedStepId={expanded ? selectedStepId : null}
              onSelectStep={setSelectedStepId}
            />
          );
        })}
      </div>

      {builderTarget && (
        <WorkflowBuilder
          agents={agents}
          workflow={builderTarget === 'new' ? null : builderTarget}
          onClose={() => setBuilderTarget(null)}
        />
      )}

      <style
        dangerouslySetInnerHTML={{
          __html: `
.wft-line { display: block; width: 1px; height: 16px; margin: 3px auto; background: rgba(255,255,255,0.12); }
.wft-fan { display: flex; align-items: flex-start; gap: 16px; }
.wft-fan-branch { position: relative; min-width: 0; flex: 1; }
.wft-node {
  position: relative;
  border-radius: 14px;
  border: 1px solid color-mix(in oklab, var(--text) 10%, transparent);
  background: var(--wft-node-bg);
  backdrop-filter: blur(10px);
  transition: border-color 0.15s ease, background 0.15s ease;
}
.wft-node:hover, .wft-node:focus-visible {
  border-color: color-mix(in oklab, var(--text) 28%, transparent);
  background: var(--wft-node-bg-hover);
}
.wft-node:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.wft-expand { animation: wft-in 0.26s var(--ease, ease-out) both; }
@keyframes wft-in { from { opacity: 0; transform: translateY(-6px); } }
@media (prefers-reduced-motion: reduce) { .wft-expand { animation: none; } }`,
        }}
      />
    </div>
  );
}

function WorkflowCard({
  wf,
  expanded,
  cardRef,
  onOpen,
  onClose,
  onEdit,
  toolLogos,
  agentPresence,
  avatarByOwner,
  runsByOwner,
  selectedStepId,
  onSelectStep,
}: {
  wf: Workflow;
  expanded: boolean;
  cardRef?: RefObject<HTMLDivElement>;
  onOpen: () => void;
  onClose: () => void;
  onEdit: () => void;
  toolLogos: Record<string, ReactNode>;
  agentPresence: Record<string, AgentPresence>;
  avatarByOwner: Record<string, string | null>;
  runsByOwner: Record<string, AgentRun[]>;
  selectedStepId: string | null;
  onSelectStep: (id: string | null) => void;
}) {
  const stats = workflowStats(wf);
  const toolIds = workflowToolIds(wf.steps);
  const liveAutos = wf.steps.filter((s) => s.automation?.state === 'live').length;
  const suggested = wf.steps.filter((s) => s.automation?.state === 'suggested').length;
  const trigger = wf.steps[0]?.title ?? 'no steps recorded';
  const selectedStep = expanded ? (wf.steps.find((s) => s.id === selectedStepId) ?? null) : null;

  return (
    <div
      ref={cardRef}
      data-workflow-card
      className={`group glass-panel relative flex flex-col overflow-hidden ${expanded ? 'col-span-full' : 'pressable is-row cursor-pointer'}`}
      onClick={expanded ? undefined : onOpen}
      role={expanded ? undefined : 'button'}
      tabIndex={expanded ? undefined : 0}
      aria-expanded={expanded}
      onKeyDown={
        expanded
          ? undefined
          : (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen();
              }
            }
      }
    >
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-medium">{wf.name}</div>
          <div className="mt-1 truncate font-mono text-[11px] text-os-dim">trigger: {trigger}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className={`pressable glass-chip grid h-7 w-7 place-items-center text-os-dim transition-opacity hover:text-os-text ${
              expanded ? '' : 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100'
            }`}
            aria-label={`Edit ${wf.name}`}
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
          </button>
          {expanded && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="pressable glass-chip grid h-7 w-7 place-items-center text-os-dim hover:text-os-text"
              aria-label="Collapse workflow"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>
          )}
        </div>
      </div>

      {!expanded && (
        <>
          <div className="mt-4 overflow-x-auto px-5">
            <MiniTree steps={wf.steps} />
          </div>
          <div className="mt-4 flex items-center gap-2 border-t border-os-border px-5 py-3">
            <span className="shrink-0 font-mono text-[10.5px] text-os-dim">
              {wf.steps.length} step{wf.steps.length === 1 ? '' : 's'}
            </span>
            {toolIds.length > 0 && (
              <>
                <span className="shrink-0 text-os-border">·</span>
                <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                  {toolIds.slice(0, 3).map((t) => (
                    <span key={t} className="glass-chip flex shrink-0 items-center gap-1 px-1.5 py-[3px]" title={toolBrand(t).name}>
                      <span className="grid h-3.5 w-3.5 place-items-center">{toolLogos[t]}</span>
                    </span>
                  ))}
                  {toolIds.length > 3 && (
                    <span className="glass-chip shrink-0 px-1.5 py-[3px] font-mono text-[10px] text-os-dim">
                      +{toolIds.length - 3}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {expanded && (
        <div className="wft-expand flex flex-col gap-5 px-5 pb-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10.5px] text-os-dim">
            <span>
              {stats.agentSteps}/{wf.steps.length} agent-run
            </span>
            <span>·</span>
            <span>
              <span style={{ color: 'var(--accent)' }}>{liveAutos} live</span>
              {suggested > 0 && <span style={{ color: 'var(--warn)' }}> · {suggested} planned</span>}
            </span>
            {stats.manualHours + stats.agentHours > 0 && (
              <>
                <span>·</span>
                <span>
                  {stats.manualHours}h human / {stats.agentHours}h agent · wk
                </span>
              </>
            )}
          </div>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="overflow-x-auto pb-1">
              <div className="mx-auto min-w-[300px] max-w-[440px]">
                <ExpandedTree
                  steps={wf.steps}
                  toolLogos={toolLogos}
                  agentPresence={agentPresence}
                  avatarByOwner={avatarByOwner}
                  selectedStepId={selectedStepId}
                  onSelectStep={onSelectStep}
                />
              </div>
            </div>
            <StepDetailPanel
              step={selectedStep}
              toolLogos={toolLogos}
              avatarByOwner={avatarByOwner}
              runsByOwner={runsByOwner}
              agentPresence={agentPresence}
              onClose={() => onSelectStep(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Compact horizontal fingerprint: root + steps as dots on a hairline. */
function MiniTree({ steps }: { steps: WorkflowStep[] }) {
  if (steps.length === 0) {
    return <div className="pb-1 text-[11px] text-os-dim">no steps recorded</div>;
  }
  return (
    <div className="flex min-w-max items-center pb-1">
      {steps.map((step, i) => {
        const tone = stepTone(step);
        const filled = step.ownerKind === 'agent' && step.automation?.state === 'live';
        const size = i === 0 ? 9 : 6;
        return (
          <div key={step.id} className="flex items-center">
            {i > 0 && <span className="h-px w-[14px] shrink-0" style={{ background: 'rgba(255,255,255,0.12)' }} />}
            <span
              className="shrink-0 rounded-full"
              title={step.title}
              style={{
                width: size,
                height: size,
                border: `1px solid ${tone.color}`,
                background: filled ? tone.color : 'transparent',
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

function ExpandedTree({
  steps,
  toolLogos,
  agentPresence,
  avatarByOwner,
  selectedStepId,
  onSelectStep,
}: {
  steps: WorkflowStep[];
  toolLogos: Record<string, ReactNode>;
  agentPresence: Record<string, AgentPresence>;
  avatarByOwner: Record<string, string | null>;
  selectedStepId: string | null;
  onSelectStep: (id: string | null) => void;
}) {
  const tree = buildWorkflowTree(steps, workflowStepParent);
  if (!tree.root) return <div className="text-[11px] text-os-dim">no steps recorded</div>;
  return (
    <TreeBranch
      node={tree.root}
      toolLogos={toolLogos}
      agentPresence={agentPresence}
      avatarByOwner={avatarByOwner}
      selectedStepId={selectedStepId}
      onSelectStep={onSelectStep}
    />
  );
}

function TreeBranch({
  node,
  toolLogos,
  agentPresence,
  avatarByOwner,
  selectedStepId,
  onSelectStep,
}: {
  node: WorkflowTreeNode;
  toolLogos: Record<string, ReactNode>;
  agentPresence: Record<string, AgentPresence>;
  avatarByOwner: Record<string, string | null>;
  selectedStepId: string | null;
  onSelectStep: (id: string | null) => void;
}) {
  const step = node.step;
  const tone = stepTone(step);
  const Icon = stepIcon(step);
  const presence = step.ownerKind === 'agent' ? agentPresence[step.owner] : undefined;
  const automationNote = step.automation
    ? step.automation.title
    : step.ownerKind === 'human'
      ? `${step.hoursPerWeek}h/week, no automation attached`
      : 'no automation attached';
  const selected = selectedStepId === step.id;
  const fan = node.children.length > 1;

  return (
    <div className="flex flex-col items-stretch">
      <button
        type="button"
        onClick={() => onSelectStep(selected ? null : step.id)}
        aria-pressed={selected}
        aria-label={`${step.title}: view step detail`}
        className="pressable wft-node flex w-full items-start gap-3 px-3.5 py-3 text-left"
        style={selected ? { borderColor: tone.color } : undefined}
      >
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
          style={{ background: `color-mix(in oklab, ${tone.color} 18%, transparent)`, border: `1px solid ${tone.color}` }}
        >
          <Icon className="h-4 w-4" strokeWidth={1.7} style={{ color: tone.color }} />
        </span>
        <div className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{step.title}</span>

          {/* owner avatar-dot + name */}
          <div className="mt-1.5 flex items-center gap-1.5">
            <AgentAvatar src={avatarByOwner[step.owner] ?? null} name={step.owner} size={16} />
            <span className="truncate text-[11px] text-os-dim">{step.owner}</span>
            {presence && (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                title={presence === 'active' ? 'agent live' : 'agent waiting on keys'}
                style={{ background: presence === 'active' ? 'var(--ok)' : 'var(--warn)' }}
              />
            )}
          </div>

          {/* automation row */}
          <div className="mt-1.5 truncate text-[10.5px]">
            <span style={{ color: tone.color }}>{tone.word}</span>
            <span className="text-os-dim"> · {automationNote}</span>
          </div>

          {step.tools.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {step.tools.map((t) => (
                <span key={t} className="glass-chip flex items-center gap-1 px-1.5 py-[3px] text-[10px] text-os-dim">
                  <span className="grid h-3 w-3 place-items-center">{toolLogos[t]}</span>
                  {toolBrand(t).name}
                </span>
              ))}
            </div>
          )}
        </div>
        {/* status hairline */}
        <span
          aria-hidden="true"
          className="absolute inset-x-3 bottom-0 h-[2px] rounded-full"
          style={{ background: tone.color, opacity: 0.4 }}
        />
      </button>

      {node.children.length > 0 && (
        <>
          <span className="wft-line" />
          <div className={fan ? 'wft-fan' : 'flex flex-col items-stretch'}>
            {node.children.map((child) => (
              <div key={child.step.id} className={fan ? 'wft-fan-branch' : 'flex flex-col items-stretch'}>
                {fan && <span className="wft-line" />}
                {child.step.branch && (
                  <div className="mb-1.5 flex justify-center">
                    <span className="glass-chip px-2 py-[2px] font-mono text-[9.5px] text-os-dim">
                      if {child.step.branch.condition}
                    </span>
                  </div>
                )}
                <TreeBranch
                  node={child}
                  toolLogos={toolLogos}
                  agentPresence={agentPresence}
                  avatarByOwner={avatarByOwner}
                  selectedStepId={selectedStepId}
                  onSelectStep={onSelectStep}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** The side drawer a clicked step node opens: full description, owner,
 *  tools, its branch condition when it's a fork, and that owner's real
 *  recent run history when it resolves to a live agent. */
function StepDetailPanel({
  step,
  toolLogos,
  avatarByOwner,
  runsByOwner,
  agentPresence,
  onClose,
}: {
  step: WorkflowStep | null;
  toolLogos: Record<string, ReactNode>;
  avatarByOwner: Record<string, string | null>;
  runsByOwner: Record<string, AgentRun[]>;
  agentPresence: Record<string, AgentPresence>;
  onClose: () => void;
}) {
  if (!step) {
    return (
      <div className="glass-panel-violet flex min-h-[220px] flex-col items-center justify-center gap-1 px-5 py-8 text-center">
        <span className="text-[12px] text-os-dim">Select a step to see its detail.</span>
      </div>
    );
  }

  const tone = stepTone(step);
  const Icon = stepIcon(step);
  const presence = step.ownerKind === 'agent' ? agentPresence[step.owner] : undefined;
  const runs = runsByOwner[step.owner] ?? [];

  return (
    <div className="glass-panel-violet flex min-h-[220px] flex-col gap-4 px-5 py-5" role="region" aria-label={`${step.title} detail`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
            style={{ background: `color-mix(in oklab, ${tone.color} 18%, transparent)`, border: `1px solid ${tone.color}` }}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.7} style={{ color: tone.color }} />
          </span>
          <div className="min-w-0">
            <div className="text-[13.5px] font-medium leading-snug">{step.title}</div>
            <div className="mt-0.5 text-[11px]" style={{ color: tone.color }}>
              {tone.word}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close step detail"
          className="pressable glass-chip grid h-6 w-6 shrink-0 place-items-center text-os-dim hover:text-os-text"
        >
          <X className="h-3 w-3" strokeWidth={1.8} />
        </button>
      </div>

      {step.branch && (
        <div className="glass-chip inline-flex w-fit items-center gap-1.5 px-2.5 py-1 font-mono text-[10.5px] text-os-dim">
          runs when: {step.branch.condition}
        </div>
      )}

      {step.detail && <p className="text-[12.5px] leading-relaxed text-os-muted">{step.detail}</p>}

      <div>
        <span className="glass-label">Owner</span>
        <div className="mt-2 flex items-center gap-2">
          <AgentAvatar src={avatarByOwner[step.owner] ?? null} name={step.owner} size={22} />
          <span className="text-[12.5px] text-os-text">{step.owner}</span>
          <span className="text-[11px] text-os-dim">{step.ownerKind === 'human' ? 'human' : 'agent'}</span>
          {presence && (
            <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[10.5px] text-os-dim">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: presence === 'active' ? 'var(--ok)' : 'var(--warn)' }}
              />
              {presence === 'active' ? 'live' : 'waiting on keys'}
            </span>
          )}
        </div>
        <div className="mt-1.5 font-mono text-[11px] text-os-dim">{step.hoursPerWeek}h / week</div>
      </div>

      {step.tools.length > 0 && (
        <div>
          <span className="glass-label">Tools</span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {step.tools.map((t) => (
              <span key={t} className="glass-chip flex items-center gap-1.5 px-2 py-1 text-[11px] text-os-muted">
                <span className="grid h-3.5 w-3.5 place-items-center">{toolLogos[t]}</span>
                {toolBrand(t).name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <span className="glass-label">Recent runs</span>
        <div className="mt-2 flex flex-col gap-1.5">
          {step.ownerKind === 'human' && <div className="text-[11.5px] text-os-dim">Human step: no run history.</div>}
          {step.ownerKind === 'agent' && runs.length === 0 && (
            <div className="text-[11.5px] text-os-dim">No runs recorded for {step.owner}.</div>
          )}
          {runs.map((run) => (
            <div key={run.id} className="flex items-center gap-2.5 text-[11.5px]">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: run.ok ? 'var(--ok)' : 'var(--err)' }}
              />
              <span className="shrink-0 font-mono text-[10.5px] text-os-dim">{relativeTime(run.startedAt)}</span>
              <span className="min-w-0 flex-1 truncate text-os-muted">{run.summary}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
