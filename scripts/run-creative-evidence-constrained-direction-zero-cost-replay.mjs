#!/usr/bin/env node

import process from "node:process";

process.env.CREATIVE_EVIDENCE_CONSTRAINED_ZERO_COST_REPLAY_AUTHORIZED = "true";
process.env.CREATIVE_ALLOW_AUTOMATIC_REPAIR = "false";
process.env.CREATIVE_APPROVED_INCREMENTAL_REPAIR_BUDGET = "0";
process.env.REPAIR_EXECUTION_AUTHORIZED = "false";
process.env.PUBLICATION_AUTHORIZED = "false";

console.log("EVIDENCE_CONSTRAINED_ZERO_COST_REPLAY_AUTHORIZED=YES");
console.log("IDENTITY_GENERATION_AUTHORIZED=NO");
console.log("IDENTITY_KEYFRAME_GENERATION_AUTHORIZED=NO");
console.log("INCREMENTAL_REPAIR_BUDGET=0");
console.log("PRODUCTION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");

await import("./run-creative-direction-zero-cost-replay.mjs");
