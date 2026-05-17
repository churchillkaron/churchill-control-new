/** @type {import('next').NextConfig} */

const nextConfig = {

  output: "standalone",

  experimental: {
    optimizePackageImports: [],
  },

  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
