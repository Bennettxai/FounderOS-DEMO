import type { CSSProperties } from 'react';
import { readAdpilotFile } from '@/lib/adpilot-data';
import { adStore } from '@/lib/foreplay/store';
import { readWatchEntries } from '@/lib/foreplay/watchlist';
import { readSavedAds } from '@/lib/foreplay/saved';
import { storeWall } from '@/lib/foreplay/wall';
import { AdPilotDeck } from '@/components/adpilot/AdPilotDeck';
import { AdLibrary } from '@/components/adpilot/AdLibrary';
import { PageHeader } from '@/components/PageHeader';
import { SectionHead } from '@/components/terminal';

export const dynamic = 'force-dynamic';

/**
 * AdPilot: the paid-media deck. Sanctioned theme exception: this page runs
 * the RED accent (scoped via CSS-variable override on the wrapper; nothing
 * outside inherits it) over a full-page black + dot-grid ground that fades
 * toward the edges. Top half is the campaign command deck: campaigns
 * arrive ONLY from the ad-account sync, never a button. Bottom half is the
 * Ad library on live Foreplay data.
 */

const RED_THEME = {
  '--accent': '#ff4557',
  '--accent-2': '#ff7582',
  '--accent-ink': '#2a060b',
  '--accent-soft': 'rgba(255, 69, 87, 0.10)',
  '--accent-line': 'rgba(255, 69, 87, 0.42)',
  // Kill the OS teal on this page's shared recipes (buttons, inputs, chips)
  '--surface-2': '#170b0f',
  '--hairline': '#2a141a',
} as CSSProperties;

export default function AdPilotPage() {
  const { campaigns, syncedAt } = readAdpilotFile();
  const wall = storeWall(80);
  const watchlist = readWatchEntries();
  const saved = readSavedAds();
  const signals = adStore.readSignals().slice(0, 60);
  const usage = adStore.readUsage();
  const meta = adStore.readMeta();

  return (
    <div className="relative" style={RED_THEME} data-adpilot>
      {/* The page ground: black base + dot grid, fading off toward the
          edges, running the FULL scroll length: no widget windows on top
          of it in the hero. */}
      <div aria-hidden className="pointer-events-none absolute -inset-x-8 -inset-y-6" style={{ background: '#04070a' }} />
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-8 -inset-y-6"
        style={{
          backgroundImage: 'radial-gradient(rgba(160,172,168,0.12) 1px, transparent 1.4px)',
          backgroundSize: '26px 26px',
          maskImage: 'linear-gradient(90deg, transparent, #000 16%, #000 84%, transparent)',
          WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 16%, #000 84%, transparent)',
        }}
      />

      <div className="relative">
        <PageHeader eyebrow="Paid media" title="AdPilot" />

        <AdPilotDeck campaigns={campaigns} syncedAt={syncedAt} />

        <section className="mt-12">
          <SectionHead label="Ad intelligence" count={`${wall.length} tracked ads`} />
          <AdLibrary
            initialWall={wall}
            watchlist={watchlist}
            saved={saved}
            signals={signals}
            credits={usage ? { remaining: usage.remaining_credits, total: usage.total_credits } : null}
            lastSyncAt={meta.lastSyncAt}
          />
        </section>
      </div>
    </div>
  );
}
