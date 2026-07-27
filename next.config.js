/** @type {import('next').NextConfig} */

const nextConfig = {
  distDir:
    process.env.AVANTIQO_NEXT_DIST_DIR ||
    ".next",

  output: "standalone",

  compiler: {
    removeConsole: process.env.NODE_ENV === "production"
      ? { exclude: ["error", "warn"] }
      : false,
  },

  experimental: {
    optimizePackageImports: [],
  },

  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
