import { allConnectorStatuses } from '@/lib/connectors';
import { readEnvLocal } from '@/lib/creds';
import { oauthReadiness } from '@/lib/oauth/store';
import { connectionCatalog, integrationsByCategory, type CatalogEntry } from '@/lib/integrations-catalog';
import { PageHeader } from '@/components/PageHeader';
import { ApiKeys } from '@/components/ApiKeys';
import { SectionHead } from '@/components/terminal';
import { ConnectionCard } from '@/components/ConnectionCard';
import { IntegrationCategory } from '@/components/IntegrationCategory';
import { Rise } from '@/components/motion';

export const dynamic = 'force-dynamic';

const GRID = 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4';

export default async function ConnectionsPage() {
  const statuses = await allConnectorStatuses();
  const env = readEnvLocal();
  const catalog = connectionCatalog(statuses, env);
  // Null for every tile whose provider has no usable authorization-code flow.
  const oauthFor = (slug: string) => oauthReadiness(slug, env);
  const detailByConnector = new Map(statuses.map((s) => [s.id, s.detail]));
  const guidanceFor = (entry: CatalogEntry) =>
    entry.connectorId ? detailByConnector.get(entry.connectorId) : undefined;

  const byId = new Map(catalog.map((c) => [c.slug, c]));
  const connected = catalog.filter((c) => c.connected);
  const popular = catalog.filter((c) => c.popular);
  const categories = [...integrationsByCategory().entries()];

  return (
    <div>
      <PageHeader eyebrow="connections" title="Connections" />

      {/* Your connected tools — driven by real connector status */}
      {connected.length > 0 && (
        <Rise as="section" i={1} className="mb-8">
          <SectionHead label="Your connected tools" count={connected.length} />
          <div className={GRID}>
            {connected.map((entry) => (
              <ConnectionCard key={entry.slug} entry={entry} guidance={guidanceFor(entry)} oauth={oauthFor(entry.slug)} />
            ))}
          </div>
        </Rise>
      )}

      {/* Popular */}
      <Rise as="section" i={2} className="mb-8">
        <SectionHead label="Popular" count={popular.length} />
        <div className={GRID}>
          {popular.map((entry) => (
            <ConnectionCard key={entry.slug} entry={entry} guidance={guidanceFor(entry)} oauth={oauthFor(entry.slug)} />
          ))}
        </div>
      </Rise>

      {/* Browse by category — collapsible */}
      <Rise as="section" i={3} className="mb-8">
        <SectionHead label="Browse by category" count={categories.length} />
        <div className="flex flex-col gap-2.5">
          {categories.map(([category, tools], idx) => (
            <IntegrationCategory key={category} label={category} count={tools.length} defaultOpen={idx === 0}>
              <div className={GRID}>
                {tools.map((tool) => (
                  <ConnectionCard
                    key={tool.slug}
                    entry={byId.get(tool.slug) as CatalogEntry}
                    guidance={guidanceFor(byId.get(tool.slug) as CatalogEntry)}
                    oauth={oauthFor(tool.slug)}
                  />
                ))}
              </div>
            </IntegrationCategory>
          ))}
        </div>
      </Rise>

      <Rise i={4}>
        <ApiKeys />
      </Rise>
    </div>
  );
}
