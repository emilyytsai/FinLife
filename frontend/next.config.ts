import type { NextConfig } from "next";

// Static export: the whole app, engine included, runs in the browser. No server features, API routes, or middleware.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
