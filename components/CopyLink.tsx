'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * Copy a lead magnet's live URL straight to the clipboard, so the operator can send
 * it to whoever asked without leaving the OS. Falls back to selecting nothing
 * loudly: on failure it says so rather than pretending it copied.
 */
export function CopyLink({ url }: { url: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'err'>('idle');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setState('ok');
    } catch {
      setState('err');
    }
    setTimeout(() => setState('idle'), 1800);
  };
  return (
    <button
      onClick={copy}
      title={`Copy ${url}`}
      className="pressable inline-flex items-center gap-1.5 rounded-sm-t border border-os-border bg-os-bg px-2 py-1 font-mono text-[10px] text-os-muted hover:border-os-dim hover:text-os-text"
    >
      {state === 'ok' ? (
        <>
          <Check className="h-3 w-3 text-os-ok" /> copied
        </>
      ) : state === 'err' ? (
        <>
          <Copy className="h-3 w-3 text-os-err" /> failed
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" /> copy
        </>
      )}
    </button>
  );
}
