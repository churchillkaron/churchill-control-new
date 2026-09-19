#!/usr/bin/env node
process.env.AVANTIQO_MUSIC_TRANSFORM_CAPABILITY = "ai.audio.extend";
process.env.AVANTIQO_MUSIC_TRANSFORM_SOURCE_MODE = "MUSICAL_CONTINUITY";
await import("./benchmark-avantiqo-music-transform.mjs");
