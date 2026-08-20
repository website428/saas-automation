import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep output tracing inside this app. A separate lockfile in the Windows
  // user profile can otherwise make Next.js infer C:\Users\princ as the root.
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
