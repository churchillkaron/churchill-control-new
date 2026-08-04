#!/usr/bin/env node

import process from "node:process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });

function text(value) {
  return String(value ?? "").trim();
}

const freshDirectionAuthorized =
  text(process.env.CREATIVE_FRESH_DIRECTION_AUTHORIZED).toLowerCase() === "true";
const providerExecutionAuthorized =
  text(process.env.CREATIVE_PROVIDER_EXECUTION_AUTHORIZED).toLowerCase() === "true";

console.log("============================================================");
console.log("CREATIVE FULL-SONG PRODUCTION EXECUTION GATE");
console.log("============================================================");
console.log("LEGACY_DIRECTION_REUSE=DISABLED");
console.log("LEGACY_DIRECTION_REPAIR=DISABLED");
console.log("LEGACY_GRAPH_RECONCILIATION=DISABLED");
console.log(`FRESH_DIRECTION_AUTHORIZED=${freshDirectionAuthorized ? "YES" : "NO"}`);
console.log(`PROVIDER_EXECUTION_AUTHORIZED=${providerExecutionAuthorized ? "YES" : "NO"}`);

if (!freshDirectionAuthorized) {
  throw new Error("CREATIVE_FRESH_DIRECTION_AUTHORIZATION_REQUIRED");
}
if (!providerExecutionAuthorized) {
  throw new Error("CREATIVE_PROVIDER_EXECUTION_AUTHORIZATION_REQUIRED");
}

console.log("EXECUTION_PATH=CANONICAL_FRESH_DIRECTION_ONLY");
console.log("============================================================");

await import("./creative-studio-full-song-safe-execute.mjs");
