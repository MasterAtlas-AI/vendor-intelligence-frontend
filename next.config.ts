import type { NextConfig } from "next";

// The browser only ever talks to this origin. `/api/v1/*` is proxied to the FastAPI backend, so the
// httpOnly refresh cookie (path /api/v1/auth) is first-party and no CORS setup is needed in any environment.
// Trailing slashes are dropped: "https://api.example.com/" would otherwise proxy to "//api/v1/..." and 404.
const backendUrl = (process.env.BACKEND_URL ?? "http://localhost:8000").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // The /api/v1 rewrite gives up after 30 s by default and answers 500 even if the API then succeeds.
    // File uploads, large curator approvals and assistant answers with web search (often 1-3 minutes) take longer.
    proxyTimeout: 300_000,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // A redirect here rather than in a root page: a page that only calls redirect() fails Next's
  // `instant` validation in dev. The (app) layout sends signed-out visitors on to /login.
  async redirects() {
    return [{ source: "/", destination: "/dashboard", permanent: false }];
  },
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${backendUrl}/api/v1/:path*` }];
  },
};

export default nextConfig;
