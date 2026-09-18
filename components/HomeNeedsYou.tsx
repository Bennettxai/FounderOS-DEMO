'use client';

import { useState } from 'react';
import { NeedsYouList } from '@/components/NeedsYouList';
import { TaskReviewPanel } from '@/components/TaskReviewPanel';
import { useDeliverables } from '@/components/useDeliverables';
import type { DeliverableItem } from '@/lib/board-deliverables';

/**
 * The console's copy of the Needs You queue, wired to the same store the
 * Deliverables tab uses.
 *
 * Mock 3a: the row answers in place, so the same decide() the review panel
 * calls is handed straight to the list. One path, one optimistic update, one
 * undo — a row approved from the queue and a row approved from the panel are
 * the same write.
 */
export function HomeNeedsYou({ boardUrl }: { boardUrl: string | null }) {
  const [reviewing, setReviewing] = useState<DeliverableItem | null>(null);
  const {
    groups,
    refreshing,
    reload,
    decisions,
    decide,
    unseenOf,
    markItemOpened,
    dismissMany,
    snoozedOf,
    snooze,
    wake,
  } = useDeliverables();

  const openItem = (item: DeliverableItem) => {
    markItemOpened(item);
    setReviewing(item);
  };

  return (
    <>
      <NeedsYouList
        groups={groups}
        refreshing={refreshing}
        onRefresh={reload}
        boardUrl={boardUrl}
        decisions={decisions}
        onOpen={openItem}
        unseenOf={unseenOf}
        onDismissMany={(items) => void dismissMany(items)}
        onDecide={(id, d, rev) => decide(id, d, rev)}
        snoozedOf={snoozedOf}
        onSnooze={snooze}
        onWake={wake}
      />
      <TaskReviewPanel
        item={reviewing}
        decision={reviewing ? decisions[reviewing.id] : undefined}
        onDecide={(id, d, rev) => void decide(id, d, rev)}
        onClose={() => setReviewing(null)}
      />
    </>
  );
}
