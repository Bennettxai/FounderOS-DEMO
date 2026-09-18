import { BrandLogo } from '@/lib/brand-logos';
import { connectKeysFor, type CatalogEntry } from '@/lib/integrations-catalog';
import { ConnectFlow, type OAuthReadiness } from '@/components/ConnectFlow';

/**
 * One integration tile in the connections marketplace: 12px tile, brand logo,
 * name + blurb, and a LIVE footer — Connect opens a paste-a-key form that
 * writes .env.local through /api/connections/connect; connected state always
 * comes from the real connector, never the stored key alone.
 *
 * Mock 3f: a connected tile carries the status in its border, not just in a
 * word at the bottom. Scanning 40 tiles for the ones that are live should be a
 * glance, and the ok token mixed into the hairline is the only place colour is
 * allowed to mean anything. Hover is the lens (pressable is-row), so the old
 * one-property border-brighten is gone: mock 1i calls that a bug.
 */
export function ConnectionCard({
  entry,
  guidance,
  oauth,
}: {
  entry: CatalogEntry;
  guidance?: string;
  /** Null for the many tiles whose provider has no usable OAuth flow. */
  oauth?: OAuthReadiness | null;
}) {
  return (
    <div
      data-lens="r"
      className={`pressable is-row group flex min-h-[112px] flex-col justify-between rounded-tile border bg-os-surface p-4 ${
        entry.connected
          ? 'border-[color-mix(in_oklab,var(--ok)_38%,var(--border))]'
          : 'border-os-border'
      }`}
    >
      <div className="flex items-start gap-3">
        <BrandLogo slug={entry.slug} name={entry.name} />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="truncate text-[13.5px] font-semibold leading-tight text-os-text">{entry.name}</div>
          <div className="mt-1 truncate text-[11px] leading-tight text-os-dim">{entry.tagline}</div>
        </div>
      </div>

      <ConnectFlow
        slug={entry.slug}
        connected={entry.connected}
        keySaved={entry.keySaved}
        keys={connectKeysFor(entry)}
        guidance={guidance}
        oauth={oauth}
      />
    </div>
  );
}
