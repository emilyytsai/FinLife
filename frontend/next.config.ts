import type { NextConfig } from "next";

// Static export for Amplify Hosting: no server features, no API routes, no middleware.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
