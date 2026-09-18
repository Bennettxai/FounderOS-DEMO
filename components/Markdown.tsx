'use client';

import { Fragment } from 'react';
import { parseInline, parseMarkdown, type Inline } from '@/lib/markdown-blocks';

/**
 * Render an agent deliverable as the document it is, not raw Markdown
 * syntax read as gibberish.
 *
 * Everything is React elements built from parsed blocks, so there is no
 * innerHTML on this path and an agent-authored file cannot inject markup.
 * Parsing and the link-scheme allowlist live in lib/markdown-blocks.ts.
 */
function Marks({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((n: Inline, i) => {
        if (n.type === 'bold') return <strong key={i} className="font-semibold text-os-text">{n.text}</strong>;
        if (n.type === 'italic') return <em key={i} className="italic">{n.text}</em>;
        if (n.type === 'code') {
          return (
            <code key={i} className="rounded-sm-t border border-os-border bg-os-bg px-1 py-px font-mono text-[11px] text-os-text">
              {n.text}
            </code>
          );
        }
        if (n.type === 'link') {
          return (
            <a
              key={i}
              href={n.href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-os-text underline decoration-os-dim underline-offset-2 hover:decoration-os-text"
            >
              {n.text}
            </a>
          );
        }
        return <Fragment key={i}>{n.text}</Fragment>;
      })}
    </>
  );
}

const HEADING_SIZE = ['text-[15px]', 'text-[14px]', 'text-[13px]', 'text-[12px]', 'text-[12px]', 'text-[12px]'];

export function Markdown({ text }: { text: string }) {
  const blocks = parseMarkdown(text);
  if (blocks.length === 0) {
    return <p className="font-mono text-[10.5px] text-os-dim">This file is empty.</p>;
  }

  return (
    <div className="space-y-3 text-[12.5px] leading-relaxed text-os-muted">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'heading':
            return (
              <h3
                key={i}
                className={`${HEADING_SIZE[b.level - 1] ?? 'text-[12px]'} pt-1 font-semibold text-os-text`}
              >
                <Marks text={b.text} />
              </h3>
            );
          case 'paragraph':
            return (
              <p key={i}>
                <Marks text={b.text} />
              </p>
            );
          case 'list':
            return b.ordered ? (
              <ol key={i} className="list-decimal space-y-1 pl-5">
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Marks text={it} />
                  </li>
                ))}
              </ol>
            ) : (
              <ul key={i} className="list-disc space-y-1 pl-5">
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Marks text={it} />
                  </li>
                ))}
              </ul>
            );
          case 'quote':
            return (
              <blockquote key={i} className="border-l-2 border-os-border-strong pl-3 italic text-os-dim">
                <Marks text={b.text} />
              </blockquote>
            );
          case 'code':
            return (
              <pre
                key={i}
                className="overflow-x-auto rounded-md-t border border-os-border bg-os-bg p-2.5 font-mono text-[11px] text-os-muted"
              >
                {b.text}
              </pre>
            );
          case 'table':
            return (
              // Wide tables scroll inside their own box rather than pushing the
              // panel sideways.
              <div key={i} className="overflow-x-auto rounded-md-t border border-os-border">
                <table className="w-full border-collapse text-[11.5px]">
                  <thead>
                    <tr className="border-b border-os-border-strong">
                      {b.header.map((h, j) => (
                        <th key={j} className="px-2 py-1.5 text-left font-semibold text-os-text">
                          <Marks text={h} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j} className="border-b border-os-border last:border-b-0">
                        {r.map((c, k) => (
                          <td key={k} className="px-2 py-1.5 align-top">
                            <Marks text={c} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'rule':
            return <hr key={i} className="border-os-border" />;
          default:
            return null;
        }
      })}
    </div>
  );
}
