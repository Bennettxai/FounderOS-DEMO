import { execFile } from 'node:child_process';

/**
 * Extract text from a PDF via the system `pdftotext` (poppler). Tries PATH then
 * the common Homebrew / usr-local locations; `-layout` keeps statement columns
 * aligned, which the line-oriented parsers depend on.
 *
 * Hosts without poppler (the dedicated host) reject here on purpose — the callers
 * offer a `text/plain` path for statements extracted somewhere else.
 */
export function pdfToText(buf: Buffer): Promise<string> {
  const candidates = ['pdftotext', '/opt/homebrew/bin/pdftotext', '/usr/local/bin/pdftotext'];
  return new Promise((resolve, reject) => {
    const tryRun = (i: number) => {
      if (i >= candidates.length) return reject(new Error('pdftotext not installed (brew install poppler)'));
      const child = execFile(
        candidates[i],
        ['-layout', '-', '-'],
        { maxBuffer: 25 * 1024 * 1024, encoding: 'utf8' },
        (err, stdout) => {
          if (err && (err as NodeJS.ErrnoException).code === 'ENOENT') return tryRun(i + 1);
          if (err) return reject(err);
          resolve(stdout);
        },
      );
      child.stdin?.end(buf);
    };
    tryRun(0);
  });
}
