import type { NextConfig } from "next";

// Two-tier URL resolution (Phase 19 — homenews lesson "Service DNS for pod-to-pod"):
//   - API_URL: runtime env, server-only. In k3s the chart sets this to
//     http://homecal-api (cluster Service DNS) so the rewrite proxy reaches the
//     API directly via the pod network — never leaves the cluster.
//   - NEXT_PUBLIC_API_URL: build-time, inlined into the client bundle as a
//     fallback for local dev. Browser-side Better Auth calls use
//     NEXT_PUBLIC_AUTH_URL directly and don't go through this rewrite.
const apiUrl =
  process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@homecal/shared"],
  rewrites: async () => [
    {
      source: "/api/:path*",
      destination: `${apiUrl}/api/:path*`,
    },
  ],
};

export default nextConfig;
