import { BrandLogo } from '@/lib/brand-logos';
import { connectKeysFor, type CatalogEntry } from '@/lib/integrations-catalog';
import { ConnectFlow } from '@/components/ConnectFlow';

/**
 * One integration tile in the connections marketplace: rounded card, brand
 * logo, name + blurb, and a LIVE footer — Connect opens a paste-a-key form
 * that writes .env.local through /api/connections/connect; connected state
 * always comes from the real connector, never the stored key alone.
 */
export function ConnectionCard({ entry, guidance }: { entry: CatalogEntry; guidance?: string }) {
  return (
    <div className="group flex min-h-[112px] flex-col justify-between rounded-2xl border border-os-border bg-os-surface p-4 transition-colors hover:border-os-border-strong">
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
      />
    </div>
  );
}
