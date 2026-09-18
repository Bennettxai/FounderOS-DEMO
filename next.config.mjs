/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Isolate the build output dir via env so a production build can run on its
  // own port without clobbering a concurrent `next dev` (which keeps `.next`).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    // Runs instrumentation.ts on server boot (Next 14 needs the opt-in).
    instrumentationHook: true,
    serverComponentsExternalPackages: ['better-sqlite3', 'node-ical', 'nodemailer'],
  },
};

export default nextConfig;
