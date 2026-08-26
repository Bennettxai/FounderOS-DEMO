/**
 * NikOS path config — the single place that maps each pillar to the real
 * local source on this machine. Every connector and agent reads through here
 * so moving the sources (or running on another box) is a one-file change.
 * All paths are absolute Windows paths (C:/Users/...) because relative
 * paths are unreliable under this shell; Node's fs handles C:/ fine.
 */
import os from 'node:os';
import path from 'node:path';

const HOME = process.env.USERPROFILE ?? process.env.HOME ?? os.homedir();

export const NIKOS_PATHS = {
  /** The-Diagnostic-Map repo (canonical maps, Reference docs, .ua graph). */
  diagmap: process.env.NIKOS_DIAGMAP_PATH ?? path.join(HOME, 'The-Diagnostic-Map'),

  /** Brainz schema-driven bot ecosystem (data/runs/<bot>/status.json). */
  brainz: process.env.NIKOS_BRAINZ_PATH ?? path.join(HOME, 'Brainz'),

  /** Hermes supervisor (~/.hermes/cron/jobs.json). */
  hermes: process.env.NIKOS_HERMES_PATH ?? path.join(HOME, '.hermes'),

  /** Bounty Radar (bounty_radar.py). */
  bounty: process.env.NIKOS_BOUNTY_PATH ?? path.join(HOME, 'bounty-radar'),

  /** OpenFieldPro field-service platform (release checklist). */
  openfieldpro: process.env.NIKOS_OPENFIELDPRO_PATH ?? path.join(HOME, 'openfieldpro'),

  /** SurfSense research agent (self-hosted RAG). */
  surfsense: process.env.NIKOS_SURFSENSE_PATH ?? path.join(HOME, 'SurfSense'),

  /** Local model files. */
  models: process.env.NIKOS_MODELS_PATH ?? path.join(HOME, 'models'),

  /** The home directory that doubles as the Claude repo (drift checks). */
  home: process.env.NIKOS_HOME_PATH ?? HOME,
} as const;
