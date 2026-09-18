'use client';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useState } from 'react';
import type { DoctorCheck } from '@/lib/connectors/gbrain';

/**
 * Mock 3b: one run state for the whole screen.
 *
 * The old rerun was a button that called router.refresh() and spun on its own,
 * so the checks under it sat there looking current while the read was already
 * in flight. The artboard treats the rerun as one event: the checks go to
 * shimmer, the ring re-fills, the checks come back in. That only works if the
 * header button and the checks column read the same busy flag, so the run
 * lives here and both of them subscribe to it.
 *
 * The read is real. GET /api/brain/overview shells `gbrain doctor --fast` and
 * returns the checks, so the shimmer covers work that is actually happening
 * rather than a timer. router.refresh() then re-renders the force-dynamic
 * server page so everything else on it (health footer, storage layers) agrees
 * with what the button just reported.
 */
type DoctorRunState = {
  busy: boolean;
  /** Checks from the last rerun in this tab. Null means "use the server's". */
  checks: DoctorCheck[] | null;
  /** Health score from the last rerun, for the ring and the done label. */
  healthScore: number | null;
  /** Set once a rerun has finished, so the button can hold its done label. */
  ran: boolean;
  rerun: () => Promise<void>;
};

const DoctorRunContext = createContext<DoctorRunState>({
  busy: false,
  checks: null,
  healthScore: null,
  ran: false,
  rerun: async () => {},
});

export function useDoctorRun(): DoctorRunState {
  return useContext(DoctorRunContext);
}

export function DoctorRunProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [ran, setRan] = useState(false);
  const [checks, setChecks] = useState<DoctorCheck[] | null>(null);
  const [healthScore, setHealthScore] = useState<number | null>(null);

  const rerun = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/brain/overview', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { doctor?: { checks?: DoctorCheck[]; healthScore?: number | null } };
      setChecks(data.doctor?.checks ?? []);
      setHealthScore(data.doctor?.healthScore ?? null);
      setRan(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [router]);

  return (
    <DoctorRunContext.Provider value={{ busy, checks, healthScore, ran, rerun }}>
      {children}
    </DoctorRunContext.Provider>
  );
}
