import { z } from 'zod';
import { WorkflowAutomationStateSchema, WorkflowOwnerKindSchema, type Workflow, type WorkflowStep } from '@/lib/schemas';

/**
 * The flat "builder shape" a workflow is authored in: by a human filling
 * out the builder panel, or by the drafting assistant. Steps reference their
 * branch parent by INDEX into this same array rather than by a stable step
 * id, because neither the builder nor a freshly-drafted workflow has real
 * step ids yet (those are assigned server-side in `buildWorkflowSteps`).
 * Shared by create (POST), update (PATCH), and the drafting route
 * (app/api/workflows/draft) so all three paths validate and shape workflows
 * identically.
 */
export const WorkflowStepInputSchema = z.object({
  title: z.string().min(1),
  detail: z.string().min(1),
  ownerKind: WorkflowOwnerKindSchema,
  owner: z.string().min(1),
  hoursPerWeek: z.number().nonnegative(),
  tools: z.array(z.string()),
  automation: z
    .object({
      title: z.string().min(1),
      state: WorkflowAutomationStateSchema,
      recoveredUsd: z.number().nonnegative(),
    })
    .nullable(),
  // Index into the SAME steps array this step lives in: the step that
  // this one forks from: or null to thread from the previous step as
  // normal. Must point strictly backward; validated below.
  branchFromIndex: z.number().int().nonnegative().nullable(),
  branchCondition: z.string().nullable(),
});
export type WorkflowStepInput = z.infer<typeof WorkflowStepInputSchema>;

export const WorkflowInputSchema = z
  .object({
    name: z.string().min(1, 'name is required'),
    subtitle: z.string(),
    steps: z.array(WorkflowStepInputSchema).min(1, 'a workflow needs at least one step'),
  })
  .superRefine((input, ctx) => {
    input.steps.forEach((step, i) => {
      if (step.branchFromIndex != null && step.branchFromIndex >= i) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['steps', i, 'branchFromIndex'],
          message: `step ${i} names a branch parent (${step.branchFromIndex}) that is not strictly before it`,
        });
      }
    });
  });
export type WorkflowInput = z.infer<typeof WorkflowInputSchema>;

/**
 * Turns the builder/draft's flat step shape into real `WorkflowStep`
 * records: assigns stable step ids (`${workflowId}-s${n}`) and resolves
 * each step's `branchFromIndex` into the real `branch.from` id that
 * `workflowStepParent` (app/workflows/tree.ts) reads.
 */
export function buildWorkflowSteps(workflowId: string, steps: WorkflowStepInput[]): WorkflowStep[] {
  const ids = steps.map((_, i) => `${workflowId}-s${i + 1}`);
  return steps.map((s, i) => ({
    id: ids[i],
    title: s.title,
    detail: s.detail,
    ownerKind: s.ownerKind,
    owner: s.owner,
    hoursPerWeek: s.hoursPerWeek,
    tools: s.tools,
    edgeLabel: null,
    leakUsd: null,
    automation: s.automation,
    branch:
      s.branchFromIndex != null && ids[s.branchFromIndex]
        ? { from: ids[s.branchFromIndex], condition: (s.branchCondition ?? '').trim() || 'branch' }
        : null,
  }));
}

/** Slug for a new workflow id: trimmed, ascii, never empty. */
export function slugifyWorkflowName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'workflow';
}

/** Converts a full `Workflow` back into the builder's flat input shape, for
 *  the edit flow (a builder opened against an existing workflow). */
export function workflowToInput(workflow: Workflow): WorkflowInput {
  const idIndex = new Map(workflow.steps.map((s, i) => [s.id, i]));
  return {
    name: workflow.name,
    subtitle: workflow.subtitle,
    steps: workflow.steps.map((s) => ({
      title: s.title,
      detail: s.detail,
      ownerKind: s.ownerKind,
      owner: s.owner,
      hoursPerWeek: s.hoursPerWeek,
      tools: s.tools,
      automation: s.automation,
      branchFromIndex: s.branch ? (idIndex.get(s.branch.from) ?? null) : null,
      branchCondition: s.branch?.condition ?? null,
    })),
  };
}
