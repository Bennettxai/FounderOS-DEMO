import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { CampaignSchema, type Campaign } from '@/lib/adpilot';

/** Server-only reader for the AdPilot campaign file: kept out of
 *  lib/adpilot.ts so client components can import the pure metric math
 *  without dragging node:fs into the bundle. */

const FileSchema = z.object({ campaigns: z.array(CampaignSchema), syncedAt: z.string().optional() });

export function adpilotDataPath(): string {
  return process.env.ADPILOT_DATA_PATH ?? path.join(process.cwd(), 'data', 'adpilot-campaigns.json');
}

export type AdpilotFile = { campaigns: Campaign[]; syncedAt: string | null };

export function readAdpilotFile(): AdpilotFile {
  try {
    const raw = JSON.parse(fs.readFileSync(adpilotDataPath(), 'utf8'));
    const parsed = FileSchema.parse(raw);
    return { campaigns: parsed.campaigns, syncedAt: parsed.syncedAt ?? null };
  } catch {
    return { campaigns: [], syncedAt: null };
  }
}

export function readCampaigns(): Campaign[] {
  return readAdpilotFile().campaigns;
}
