import path from "node:path";
import type { NextConfig } from "next";

const repoRoot = path.join(__dirname, "../..");

const nextConfig: NextConfig = {
  transpilePackages: ["@zerocarbon/shared", "geist"],
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  poweredByHeader: false,
};

export default nextConfig;
