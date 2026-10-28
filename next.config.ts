import type { NextConfig } from "next";

// The browser only ever talks to this origin. `/api/v1/*` is proxied to the FastAPI backend, so the
// httpOnly refresh cookie (path /api/v1/auth) is first-party and no CORS setup is needed in any environment.
const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${backendUrl}/api/v1/:path*` }];
  },
};

export default nextConfig;
