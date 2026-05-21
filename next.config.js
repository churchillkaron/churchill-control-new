/** @type {import('next').NextConfig} */

const { withSentryConfig } = require("@sentry/nextjs");

const nextConfig = {
  output: "standalone",

  experimental: {
    optimizePackageImports: [],
  },

  images: {
    unoptimized: true,
  },
};

module.exports = withSentryConfig(nextConfig, {
  org: "churchill-qu",
  project: "javascript-nextjs",

  silent: !process.env.CI,

  widenClientFileUpload: true,

  tunnelRoute: "/monitoring",

  automaticVercelMonitors: true,
});
