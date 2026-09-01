/** @type {import('next').NextConfig} */
const nextConfig = {
  // Isolate the build output dir via env so a production build can run on its
  // own port without clobbering a concurrent `next dev` (which keeps `.next`).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'node-ical', 'nodemailer'],
    // Run instrumentation.ts at startup (Next 14 gates it behind this flag) so
    // the production access-token boot check fires.
    instrumentationHook: true,
  },
  // Baseline security headers on every response. Conservative set (no CSP, which
  // needs per-request nonces here) — clickjacking, MIME-sniffing, referrer leak,
  // transport downgrade, and powerful-feature access are all closed off.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
