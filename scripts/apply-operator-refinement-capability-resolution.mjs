import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

const runtimePath = "lib/operator/runtime/OperatorTurnRuntime.js";
const packagePath = "package.json";
const runtime = await readFile(runtimePath, "utf8");

const refinementImport = `import {\n  RECOMMENDATION_ALTERNATIVE_PATTERN,\n  agreementWithRecommendationRefinementDecision,\n  agreementWithRecommendationRefinementMaterialized,\n  classifyRecommendationRefinementAdvanceRequest,\n  classifyRecommendationRefinementMaterializationRequest,\n  classifyRecommendationRefinementReply,\n  createRecommendationRefinementProposal,\n  isRecommendationRefinementStatusMessage,\n  recommendationRefinementProposalFromAgreementState,\n} from "./OperatorRecommendationRefinement";`;
const resolverImport = `${refinementImport}\nimport {\n  resolveRecommendationRefinementCapability,\n} from "./OperatorRecommendationRefinementCapabilityResolver";`;
assert.ok(runtime.includes(refinementImport), "expected refinement import block missing");
assert.ok(!runtime.includes("OperatorRecommendationRefinementCapabilityResolver"), "resolver already integrated");

const oldSelection = `  const safeCapabilities = await safeRecommendationCapabilities(options);\n  const capability = capabilityByKey(\n    safeCapabilities,\n    proposal?.previous_capability_key,\n  );`;
const newSelection = `  const safeCapabilities = await safeRecommendationCapabilities(options);\n  const capabilityResolution = resolveRecommendationRefinementCapability({\n    proposal,\n    capabilities: safeCapabilities,\n  });\n  const capability = capabilityResolution.capability;`;
assert.ok(runtime.includes(oldSelection), "expected legacy materialization capability lookup missing");

let nextRuntime = runtime
  .replace(refinementImport, resolverImport)
  .replace(oldSelection, newSelection);

const catalogAnchor = `        recommendation_refinement_materialization: true,\n        materialization_ready: false,`;
const catalogEvidence = `        recommendation_refinement_materialization: true,\n        refinement_capability_resolution: capabilityResolution.resolution_kind,\n        refinement_capability_strong_match: capabilityResolution.strong_match,\n        refinement_old_capability_identity_reused:\n          capabilityResolution.old_capability_identity_reused,\n        refinement_ranked_candidate_count:\n          capabilityResolution.ranked_candidate_count,\n        materialization_ready: false,`;
const catalogOccurrences = nextRuntime.split(catalogAnchor).length - 1;
assert.equal(catalogOccurrences, 2, "expected two fail-closed materialization catalog branches");
nextRuntime = nextRuntime.replaceAll(catalogAnchor, catalogEvidence);

const successAnchor = `      recommendation_refinement_materialization: true,\n      materialization_ready: true,`;
const successEvidence = `      recommendation_refinement_materialization: true,\n      refinement_capability_resolution: capabilityResolution.resolution_kind,\n      refinement_capability_strong_match: capabilityResolution.strong_match,\n      refinement_old_capability_identity_reused:\n        capabilityResolution.old_capability_identity_reused,\n      refinement_ranked_candidate_count:\n        capabilityResolution.ranked_candidate_count,\n      materialization_ready: true,`;
assert.ok(nextRuntime.includes(successAnchor), "expected successful materialization catalog branch missing");
nextRuntime = nextRuntime.replace(successAnchor, successEvidence);

assert.ok(nextRuntime.includes("resolveRecommendationRefinementCapability({"));
assert.ok(!nextRuntime.includes(oldSelection));
await writeFile(runtimePath, nextRuntime);

const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
const script = String(packageJson.scripts?.["audit:operator-conversation-governance"] || "");
const auditCommand = "node scripts/operator-recommendation-refinement-capability-resolution-audit.mjs";
assert.ok(script, "operator conversation governance audit missing");
if (!script.includes(auditCommand)) {
  packageJson.scripts["audit:operator-conversation-governance"] = `${script} && ${auditCommand}`;
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

console.log("OPERATOR_REFINEMENT_CAPABILITY_PATCH_APPLIED=YES");
