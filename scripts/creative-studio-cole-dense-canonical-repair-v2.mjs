#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const SOURCE_PATH = path.join(
  ROOT,
  "scripts/creative-studio-cole-dense-canonical-repair.mjs",
);
const TEMP_PATH = path.join(
  ROOT,
  `scripts/.tmp-cole-dense-canonical-repair-v2-${process.pid}.mjs`,
);

const OLD_BLOCK = `function scoreScale(analysis, frame = {}) {
  if (!analysis) return 1;
  const values = [
    analysis.face_visibility_score,
    analysis.technical_quality_score,
    analysis.performance_energy_score,
  ].map((value) => finite(value, null)).filter((value) => value !== null);
  if (!values.length) return 1;
  const maximum = Math.max(...values);
  const minimum = Math.min(...values);

  // The first paid checkpoint for every candidate came from the original v2
  // prompt, which explicitly required 0-100 scores. Recovery-created frames
  // are marked reused=false and came from the v1 recovery prompt that omitted
  // the score scale. Those responses consistently used 0-10.
  if (frame.reused === false && minimum >= 0 && maximum <= 10) return 10;
  if (frame.reused === true) return 1;
  return minimum >= 0 && maximum <= 10 ? 10 : 1;
}`;

const NEW_BLOCK = `function scoreScale(analysis) {
  if (!analysis) return 1;
  const values = [
    analysis.face_visibility_score,
    analysis.technical_quality_score,
    analysis.performance_energy_score,
  ].map((value) => finite(value, null)).filter((value) => value !== null);
  if (!values.length) return 1;
  const maximum = Math.max(...values);
  const minimum = Math.min(...values);

  // The original prompt explicitly requested 0-100 scores. The recovery
  // prompt omitted that rule and its saved responses consistently used 0-10.
  // Checkpoint reuse describes persistence, not the provider's score scale,
  // so the numeric response itself is the canonical scale evidence.
  return minimum >= 0 && maximum <= 10 ? 10 : 1;
}`;

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: process.env,
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (signal) {
        reject(new Error(`COLE_CANONICAL_REPAIR_V2_SIGNAL:${signal}`));
        return;
      }
      resolve(Number.isInteger(code) ? code : 1);
    });
  });
}

const source = await fs.readFile(SOURCE_PATH, "utf8");
let executableSource;
let patchStatus;

if (source.includes(OLD_BLOCK)) {
  executableSource = source.replace(OLD_BLOCK, NEW_BLOCK);
  patchStatus = "FAULTY_REUSED_FLAG_SCALE_LOGIC_REPLACED";
} else if (source.includes(NEW_BLOCK)) {
  executableSource = source;
  patchStatus = "CANONICAL_NUMERIC_SCALE_LOGIC_ALREADY_PRESENT";
} else {
  throw new Error("COLE_CANONICAL_REPAIR_SOURCE_SHAPE_UNEXPECTED");
}

if (executableSource.includes("if (frame.reused === true) return 1;")) {
  throw new Error("COLE_CANONICAL_REPAIR_FAULTY_SCALE_LOGIC_REMAINS");
}
if (!executableSource.includes("return minimum >= 0 && maximum <= 10 ? 10 : 1;")) {
  throw new Error("COLE_CANONICAL_REPAIR_NUMERIC_SCALE_LOGIC_REQUIRED");
}

await fs.writeFile(TEMP_PATH, executableSource, "utf8");

console.log("============================================================");
console.log("COLE DENSE CANONICAL REPAIR V2 GUARD");
console.log("============================================================");
console.log(`SOURCE_PATH=${SOURCE_PATH}`);
console.log(`TEMP_EXECUTION_PATH=${TEMP_PATH}`);
console.log(`SCORE_SCALE_PATCH_STATUS=${patchStatus}`);
console.log("PROVIDER_CALLS_ADDED_BY_GUARD=0");
console.log("WALLET_CHARGES_ADDED_BY_GUARD=0");
console.log("PRODUCTION_AUTHORIZED_BY_GUARD=NO");
console.log("============================================================");

let exitCode = 1;
try {
  exitCode = await run(process.execPath, [
    "--loader",
    "./scripts/next-alias-loader.mjs",
    TEMP_PATH,
  ]);
} finally {
  await fs.rm(TEMP_PATH, { force: true }).catch(() => null);
}

console.log("============================================================");
console.log(`COLE_CANONICAL_REPAIR_V2_EXIT_STATUS=${exitCode}`);
console.log("TEMP_EXECUTION_FILE_REMOVED=YES");
console.log("============================================================");

process.exitCode = exitCode;
