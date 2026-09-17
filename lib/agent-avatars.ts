import { readdirSync } from 'node:fs';
import path from 'node:path';

/** Which agents have a profile photo in public/agents/. Read per render -
 *  the dir is tiny: so a dropped-in photo shows on the next request. */
export function agentAvatars(): Map<string, string> {
  const map = new Map<string, string>();
  try {
    for (const f of readdirSync(path.join(process.cwd(), 'public', 'agents'))) {
      const m = f.match(/^(.+)\.(jpg|jpeg|png|webp)$/i);
      if (m && !map.has(m[1])) map.set(m[1], `/agents/${f}`);
    }
  } catch {
    /* no photos dir: everyone gets the generic icon */
  }
  return map;
}
