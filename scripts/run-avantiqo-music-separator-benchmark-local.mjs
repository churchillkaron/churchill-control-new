#!/usr/bin/env node
const text = (value) => String(value ?? "").trim();
for (const name of ["AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SPEND_APPROVED", "AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_RIGHTS_APPROVED"]) {
  if (text(process.env[name]).toUpperCase() !== "YES") throw new Error(`${name}=YES_REQUIRED`);
}
await import("./benchmark-avantiqo-music-separator.mjs");
