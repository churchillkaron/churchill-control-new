import fs from "node:fs";

const CONTRACT = "AVANTIQO_INTELLIGENCE_SETTLEMENT_ENVELOPE_REPAIR_V1";
const path = "lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js";
let source = fs.readFileSync(path, "utf8");

const importAnchor = `import {\n  resolveAvantiqoResearchEvidencePayload,\n} from "./AvantiqoResearchEvidencePayloadRuntime.mjs";\n`;
const importReplacement = `${importAnchor}import {\n  resolveIntelligenceSettledOutputEnvelope,\n} from "./AvantiqoIntelligenceOutputEnvelopeRuntime.mjs";\n`;

if (!source.includes(importAnchor)) {
  throw new Error(`${CONTRACT}_IMPORT_ANCHOR_NOT_FOUND`);
}
if (!source.includes("resolveIntelligenceSettledOutputEnvelope")) {
  source = source.replace(importAnchor, importReplacement);
}

const oldEnvelope = `function outputEnvelope(execution = {}) {\n  const first = object(execution?.output);\n  const second = object(first.output);\n  return Object.keys(second).length ? second : first;\n}\n`;
const newEnvelope = `function outputEnvelope(execution = {}) {\n  return resolveIntelligenceSettledOutputEnvelope(execution);\n}\n`;

if (source.includes(oldEnvelope)) {
  source = source.replace(oldEnvelope, newEnvelope);
} else if (!source.includes(newEnvelope)) {
  throw new Error(`${CONTRACT}_OUTPUT_ENVELOPE_ANCHOR_NOT_FOUND`);
}

if (!source.includes('return resolveIntelligenceSettledOutputEnvelope(execution);')) {
  throw new Error(`${CONTRACT}_CANONICAL_DECODER_NOT_WIRED`);
}
if (!source.includes('execution = await settlePendingReasoningExecution({')) {
  throw new Error(`${CONTRACT}_SETTLEMENT_PATH_MISSING`);
}

fs.writeFileSync(path, source);
console.log(`${CONTRACT}=PASS`);
