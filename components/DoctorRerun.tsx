'use client';

import { AsyncButton } from '@/components/AsyncButton';
import { useDoctorRun } from '@/components/DoctorRun';

/**
 * Mock 3b: the button says the command it runs.
 *
 * "re-run checks" hid what was happening; the artboard puts the literal
 * `gbrain doctor --fast` on the control, because that is the command the
 * operator would actually type. Busy is a spinner and "checking", done is the score that came
 * back, so the label itself is the receipt. The run is owned by DoctorRun so
 * the checks column shimmers on the same press.
 */
export function DoctorRerun() {
  const { rerun, ran, healthScore } = useDoctorRun();
  const done = ran && healthScore !== null ? `${healthScore}/100` : 'checked';
  return (
    <AsyncButton
      run={rerun}
      busyLabel="checking"
      doneLabel={done}
      tone="primary"
      showElapsed
    >
      ▸ gbrain doctor --fast
    </AsyncButton>
  );
}
