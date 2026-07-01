/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    TARGET_DATE: process.env.TARGET_DATE ?? "2025-11-25",
  },
};

module.exports = nextConfig;
