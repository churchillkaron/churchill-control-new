import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

await import("./finish-avantiqo-voice-tts-listen-local.mjs");
