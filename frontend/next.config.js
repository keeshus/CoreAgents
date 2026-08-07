/** @type {import('next').NextConfig} */
// The /api rewrite exists only for deployments without a reverse proxy
// (e.g. the e2e stack, where BACKEND_URL is set at runtime in dev mode).
// Production uses nginx to route /api to the backend, so the rewrite must
// stay disabled there (BACKEND_URL is unset at build time).
const BACKEND_URL = process.env.BACKEND_URL;

const nextConfig = {
  async rewrites() {
    if (!BACKEND_URL) return [];
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
