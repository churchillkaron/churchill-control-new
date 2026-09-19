#!/usr/bin/env node
process.env.AVANTIQO_MUSIC_TRANSFORM_CAPABILITY = "ai.audio.remix";
process.env.AVANTIQO_MUSIC_TRANSFORM_SOURCE_MODE = "MUSICAL_VARIATION";
await import("./benchmark-avantiqo-music-transform.mjs");
