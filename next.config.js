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
    },
  },

  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
