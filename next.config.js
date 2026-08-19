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
    outputFileTracingIncludes: {
      "/api/creative/**": ["./.avantiqo/bin/ffmpeg"],
      "/api/internal/avantiqo-investor-film-final": [
        "./.avantiqo/bin/ffmpeg",
      ],
      "/api/internal/avantiqo-investor-film-finished": [
        "./.avantiqo/bin/ffmpeg",
      ],
      "/api/internal/avantiqo-investor-logo-reveal": [
        "./.avantiqo/bin/ffmpeg",
      ],
      "/api/internal/avantiqo-investor-film-lipsync": [
        "./.avantiqo/bin/ffmpeg",
      ],
      "/api/internal/avantiqo-investor-video-voice-v3": [
        "./.avantiqo/bin/ffmpeg",
      ],
      "/api/internal/avantiqo-investor-founder-audio-lock": [
        "./.avantiqo/bin/ffmpeg",
      ],
    },
  },

  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
