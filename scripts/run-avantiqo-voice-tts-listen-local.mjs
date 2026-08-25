import { readFile } from "node:fs/promises";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const lockPath = "audits/results/avantiqo-voice-tts-controlled-generation.json";
let resumeLockedGeneration = false;
try {
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  resumeLockedGeneration = Boolean(
    lock?.contract === "AVANTIQO_VOICE_TTS_CONTROLLED_GENERATION_V1" &&
    lock?.generation_submitted === true &&
    Number(lock?.accepted_generation_count) === 1 &&
    lock?.new_generation_allowed === false &&
    String(lock?.job_id || "").trim(),
  );
} catch {
  resumeLockedGeneration = false;
}

if (resumeLockedGeneration) {
  await import("./resume-avantiqo-voice-tts-controlled-generation-local.mjs");
} else {
  await import("./finish-avantiqo-voice-tts-listen-local.mjs");
}
