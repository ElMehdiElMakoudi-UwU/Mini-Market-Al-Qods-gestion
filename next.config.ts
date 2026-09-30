import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (deployed with Coolify).
  output: "standalone",
  poweredByHeader: false,
};

export default nextConfig;
