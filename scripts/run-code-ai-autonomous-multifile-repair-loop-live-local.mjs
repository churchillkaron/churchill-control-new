import process from "node:process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

function text(value) {
  return String(value ?? "").trim();
}

const codeKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY);
const genericKey = text(process.env.RUNPOD_API_KEY);
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
const queueKey = codeKey || genericKey || managementKey;

if (!queueKey) {
  throw new Error(
    "RUNPOD_AVANTIQO_CODE_API_KEY_OR_RUNPOD_API_KEY_OR_RUNPOD_MANAGEMENT_API_KEY_REQUIRED",
  );
}

if (!codeKey && !genericKey) {
  process.env.RUNPOD_API_KEY = queueKey;
}

console.log("AVANTIQO_CODE_REPAIR_LOOP_CREDENTIAL_PRESENT=true");
console.log(`AVANTIQO_CODE_REPAIR_LOOP_CREDENTIAL_SOURCE=${codeKey ? "CODE" : genericKey ? "GENERIC" : "MANAGEMENT_FALLBACK"}`);
console.log("AVANTIQO_CODE_REPAIR_LOOP_SECRET_VALUES_PRINTED=false");

await import("./certify-code-ai-autonomous-multifile-repair-loop-live.mjs");
