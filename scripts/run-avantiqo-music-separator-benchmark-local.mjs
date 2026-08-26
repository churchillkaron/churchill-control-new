#!/usr/bin/env node

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

await import("./benchmark-avantiqo-music-separator.mjs");
