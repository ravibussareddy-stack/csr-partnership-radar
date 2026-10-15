import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Local-only embedded Postgres; keep it out of the server bundle.
  serverExternalPackages: ["@electric-sql/pglite", "@react-pdf/renderer"],
  async redirects() {
    return [{ source: "/planner", destination: "/funding", permanent: true }];
  },
};

export default nextConfig;
