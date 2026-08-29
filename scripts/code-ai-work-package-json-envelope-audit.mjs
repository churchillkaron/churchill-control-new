import assert from "node:assert/strict";

import {
  CODE_AI_WORK_PACKAGE_CONTRACT,
  parseCodeAIWorkPackage,
} from "../lib/code/runtime/CodeAIWorkPackageCoreRuntime.js";

const CONTRACT = "AVANTIQO_CODE_AI_WORK_PACKAGE_JSON_ENVELOPE_AUDIT_V1";

const base = {
  contract: CODE_AI_WORK_PACKAGE_CONTRACT,
  phase: "verification",
  summary: "verify current implementation",
  operations: [
    {
      action: "verify",
      description: "verify",
      input: { command: "node", args: ["scripts/example.mjs"] },
    },
    {
      action: "diff",
      description: "diff",
      input: {},
    },
  ],
};

const clean = parseCodeAIWorkPackage(JSON.stringify(base));
assert.equal(clean.operations.length, 2);
assert.equal(clean.controller_normalizations.length, 0);

const fenced = parseCodeAIWorkPackage(`\`\`\`json\n${JSON.stringify(base)}\n\`\`\``);
assert.equal(fenced.operations.length, 2);
assert.equal(fenced.controller_normalizations.length, 0);

const chatter = parseCodeAIWorkPackage(
  `Here is the requested package.\n${JSON.stringify(base)}\nNo further commentary.`,
);
assert.equal(chatter.operations.length, 2);
assert.equal(
  chatter.controller_normalizations.some(
    (item) => item.kind === "EXTRACT_SINGLE_VALID_JSON_OBJECT_ENVELOPE",
  ),
  true,
);

const unrelatedObjectPlusPackage = parseCodeAIWorkPackage(
  `${JSON.stringify({ note: "diagnostic only" })}\n${JSON.stringify(base)}`,
);
assert.equal(unrelatedObjectPlusPackage.operations.length, 2);
assert.equal(
  unrelatedObjectPlusPackage.controller_normalizations.some(
    (item) => item.kind === "EXTRACT_SINGLE_VALID_JSON_OBJECT_ENVELOPE",
  ),
  true,
);

assert.throws(
  () => parseCodeAIWorkPackage(`${JSON.stringify(base)}\n${JSON.stringify(base)}`),
  /CODE_AI_WORK_PACKAGE_JSON_AMBIGUOUS/,
);

assert.throws(
  () => parseCodeAIWorkPackage(JSON.stringify(base).slice(0, -7)),
  /CODE_AI_WORK_PACKAGE_JSON_INVALID/,
);

assert.throws(
  () => parseCodeAIWorkPackage('{"contract":"AVANTIQO_CODE_AI_WORK_PACKAGE_V1", bad json }'),
  /CODE_AI_WORK_PACKAGE_JSON_INVALID/,
);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  clean_json_verified: true,
  fenced_json_verified: true,
  chatter_wrapped_valid_json_verified: true,
  unrelated_object_plus_single_contract_package_verified: true,
  multiple_contract_packages_rejected: true,
  truncated_json_rejected: true,
  malformed_json_rejected: true,
  model_call_performed: false,
  provider_call_performed: false,
  wallet_mutation_performed: false,
  runpod_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
