import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    // Bound local and CI build concurrency for predictable resource usage.
    cpus: 1,
  },
  reactCompiler: true,
};

export default withNextIntl(nextConfig);
