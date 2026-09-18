import { getDb } from '@/lib/data';
import { PageHeader } from '@/components/PageHeader';
import { Rise } from '@/components/motion';

export const dynamic = 'force-dynamic';

export default function ReferencePage() {
  const db = getDb();
  const domains = db.domains.all();

  return (
    <div>
      <PageHeader
        eyebrow="operating domains"
        title="Reference Model"
      />
      <Rise i={1} className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4 ultra:grid-cols-6">
        {domains.map((domain) => (
          <div key={domain.id} data-lens="r" className="pressable is-row rounded-lg-t border border-os-border bg-os-surface px-[17px] py-[15px]">
            <div className="font-mono text-[10px] tracking-[0.14em] text-os-accent">
              {String(domain.number).padStart(2, '0')}
            </div>
            <h2 className="mt-1.5 text-[13.5px] font-bold">{domain.title}</h2>
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {domain.items.map((item) => (
                <li
                  key={item}
                  className="rounded-sm-t border border-os-border bg-os-surface2 px-[9px] py-1.5 font-mono text-[10.5px] text-os-muted"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Rise>
    </div>
  );
}
