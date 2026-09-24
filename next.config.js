const path = require("path");

/** @type {import('next').NextConfig} */

const creativeMediaBinaries = [
  "./.avantiqo/bin/ffmpeg",
  "./.avantiqo/bin/ffprobe",
];

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
    outputFileTracingIncludes: {
      "/api/creative/**": creativeMediaBinaries,
      "/api/internal/avantiqo-investor-film-final": creativeMediaBinaries,
      "/api/internal/avantiqo-investor-film-finished": creativeMediaBinaries,
      "/api/internal/avantiqo-investor-logo-reveal": creativeMediaBinaries,
      "/api/internal/avantiqo-investor-film-lipsync": creativeMediaBinaries,
      "/api/internal/avantiqo-investor-video-voice-v3": creativeMediaBinaries,
      "/api/internal/avantiqo-investor-founder-audio-lock": creativeMediaBinaries,
      "/api/internal/creative-churchill-night-changes-v3-qc": creativeMediaBinaries,
      "/api/internal/creative-churchill-night-changes-v3-repair-qc": creativeMediaBinaries,
    },
  },

  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "raw.githubusercontent.com" },
    ],
  },

  webpack(config, { dev }) {
    if (dev && process.env.AVANTIQO_DEV_DISK_CACHE === "1") {
      config.cache = {
        type: "filesystem",
        cacheDirectory: path.resolve(
          __dirname,
          process.env.AVANTIQO_NEXT_DIST_DIR || ".next",
          "cache",
          "webpack",
        ),
        buildDependencies: {
          config: [__filename],
        },
      };
    } else if (dev) {
      config.cache = { type: "memory" };
    }
    return config;
  },
};

module.exports = nextConfig;
