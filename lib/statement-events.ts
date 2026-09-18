/**
 * The upload and the expenses panel are siblings on /finances (the uploader is
 * rendered as a child of the panel, not a parent), so a statement landing has
 * to reach the panel some other way. One browser event, no shared store: the
 * uploader says which months it just filed, the panel moves to the newest of
 * them once the refreshed server data carries it.
 *
 * Pure module: no DOM access at import time, so client components can value
 * import it (tests/client-boundary.test.ts).
 */

export const STATEMENT_UPLOADED = 'founder-os:statement-uploaded';

export type StatementUploadedDetail = { months: string[] };
