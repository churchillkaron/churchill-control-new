#!/usr/bin/env node

import fs from "node:fs";
import { spawnSync } from "node:child_process";

const path = "scripts/apply-creative-evidence-fidelity-v5.mjs";
let source = fs.readFileSync(path, "utf8");

const replacements = [
  [
    '        `EVIDENCE ROLE MANIFEST: ${JSON.stringify(evidenceManifest || {})}`,',
    '        "EVIDENCE ROLE MANIFEST: " + JSON.stringify(evidenceManifest || {}),',
  ],
  [
    '        `REFERENCE MANIFEST: ${JSON.stringify(referenceManifest || [])}`,',
    '        "REFERENCE MANIFEST: " + JSON.stringify(referenceManifest || []),',
  ],
  [
    '        `SHOT CONTRACT: ${JSON.stringify(specification?.shot || {})}`,',
    '        "SHOT CONTRACT: " + JSON.stringify(specification?.shot || {}),',
  ],
  [
    '      { type: "input_text", text: `AUTHORITATIVE EVIDENCE IMAGE ${index + 1}` },',
    '      { type: "input_text", text: "AUTHORITATIVE EVIDENCE IMAGE " + (index + 1) },',
  ],
  [
    '      { type: "input_text", text: `PREVIOUS STORY FRAME ${index + 1}` },',
    '      { type: "input_text", text: "PREVIOUS STORY FRAME " + (index + 1) },',
  ],
];

for (const [unsafe, safe] of replacements) {
  if (source.includes(unsafe)) {
    source = source.replaceAll(unsafe, safe);
  }
}

for (const [, safe] of replacements) {
  if (!source.includes(safe)) {
    throw new Error(
      "CREATIVE_EVIDENCE_FIDELITY_V5_SAFE_REWRITE_INCOMPLETE",
    );
  }
}

fs.writeFileSync(path, source);

const check = spawnSync(process.execPath, ["--check", path], {
  stdio: "inherit",
});
if (check.status !== 0) {
  throw new Error("CREATIVE_EVIDENCE_FIDELITY_V5_SYNTAX_INVALID");
}

const run = spawnSync(process.execPath, [path], {
  stdio: "inherit",
});
if (run.status !== 0) {
  throw new Error("CREATIVE_EVIDENCE_FIDELITY_V5_MATERIALIZATION_FAILED");
}

console.log("CREATIVE_EVIDENCE_FIDELITY_V5_SAFE_LOADER=PASS");
