#!/usr/bin/env node

// Hard-budget entry point for the one-clip proof.
//
// The original one-clip command checked CREATIVE_CLIP_SPEND_APPROVED only after
// CreativeDirectorRuntime.execute(), which means research and direction could already
// have made paid provider calls while the command still printed SPEND_APPROVED=NO.
// This wrapper sits before that import boundary: no paid Studio code is imported at all
// unless spending is explicitly approved.
//
// It also turns the proof into one bounded commercial act. Research, direction and
// generation each keep their own existing ceiling, but their authorised envelopes must
// fit inside a single total ceiling before execution begins.

import process from "node:process";

function numberFromEnv(name, fallback) {
  const raw = String(process.env[name] ?? "").trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name}_INVALID`);
  }
  return value;
}

const approved =
  String(process.env.CREATIVE_CLIP_SPEND_APPROVED || "")
    .trim()
    .toUpperCase() === "YES";

const totalCeiling = numberFromEnv(
  "CREATIVE_CLIP_TOTAL_MAXIMUM_THB",
  45,
);
const researchCeiling = numberFromEnv(
  "CREATIVE_CLIP_RESEARCH_MAXIMUM_THB",
  5,
);
const directionCeiling = numberFromEnv(
  "CREATIVE_CLIP_DIRECTION_MAXIMUM_THB",
  15,
);
const generationCeiling = numberFromEnv(
  "CREATIVE_CLIP_MAXIMUM_THB",
  25,
);
const authorisedEnvelope =
  researchCeiling + directionCeiling + generationCeiling;

console.log("============================================================");
console.log("CREATIVE ONE CLIP SAFE ENTRY");
console.log("============================================================");
console.log(`SPEND_APPROVED=${approved ? "YES" : "NO"}`);
console.log(`TOTAL_CEILING_THB=${totalCeiling}`);
console.log(`RESEARCH_CEILING_THB=${researchCeiling}`);
console.log(`DIRECTION_CEILING_THB=${directionCeiling}`);
console.log(`GENERATION_CEILING_THB=${generationCeiling}`);
console.log(`AUTHORISED_ENVELOPE_THB=${authorisedEnvelope}`);

if (!approved) {
  console.log("PAID_PIPELINE_EXECUTED=NO");
  console.log("PROVIDER_CALLS_AUTHORISED=NO");
  console.log(
    "Set CREATIVE_CLIP_SPEND_APPROVED=YES only for the deliberate bounded proof run.",
  );
  process.exit(0);
}

if (totalCeiling <= 0) {
  throw new Error("CREATIVE_CLIP_TOTAL_MAXIMUM_THB_REQUIRED");
}

if (authorisedEnvelope > totalCeiling) {
  throw new Error(
    `CREATIVE_CLIP_AUTHORISED_ENVELOPE_ABOVE_TOTAL_CEILING:${authorisedEnvelope}>${totalCeiling}`,
  );
}

if (researchCeiling <= 0) {
  throw new Error("CREATIVE_CLIP_RESEARCH_MAXIMUM_THB_REQUIRED");
}
if (directionCeiling <= 0) {
  throw new Error("CREATIVE_CLIP_DIRECTION_MAXIMUM_THB_REQUIRED");
}
if (generationCeiling <= 0) {
  throw new Error("CREATIVE_CLIP_MAXIMUM_THB_REQUIRED");
}

// Pin the exact envelopes checked above so the imported command cannot silently fall
// back to its historical wider defaults.
process.env.CREATIVE_CLIP_TOTAL_MAXIMUM_THB = String(totalCeiling);
process.env.CREATIVE_CLIP_RESEARCH_MAXIMUM_THB = String(researchCeiling);
process.env.CREATIVE_CLIP_DIRECTION_MAXIMUM_THB = String(directionCeiling);
process.env.CREATIVE_CLIP_MAXIMUM_THB = String(generationCeiling);

console.log("PAID_PIPELINE_EXECUTED=YES");
console.log("PROVIDER_CALLS_AUTHORISED=YES");

await import("./creative-one-clip.mjs");
