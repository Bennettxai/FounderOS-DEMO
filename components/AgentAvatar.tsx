'use client';

/**
 * Per-agent profile photo with a generic fallback. Pages resolve `src` from
 * lib/agent-avatars (a manifest of public/agents/<agent-id>.jpg|png), so an
 * agent without a photo renders the generic stroke icon with zero network
 * probing: the console stays clean. Never an emoji, never a fake face.
 */

import { useState } from 'react';
import { Bot } from 'lucide-react';

export function AgentAvatar({ src, name, size = 24 }: { src: string | null; name?: string; size?: number }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span
        className="grid shrink-0 place-items-center rounded-full border border-os-border bg-os-surface text-os-dim"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <Bot size={Math.max(11, Math.round(size * 0.55))} strokeWidth={1.7} />
      </span>
    );
  }
  return (
    // Plain <img>: tiny fixed-size avatars with an onError fallback: nothing
    // for next/image to optimize here.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name ? `${name} avatar` : ''}
      width={size}
      height={size}
      className="shrink-0 rounded-full border border-os-border object-cover"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}
