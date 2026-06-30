import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    TARGET_DATE: process.env.TARGET_DATE ?? "2025-11-25",
  },
};

export default nextConfig;
