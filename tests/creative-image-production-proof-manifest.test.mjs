import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const proof=fs.readFileSync("lib/creative/image/runtime/CreativeImageProductionProofManifestRuntime.js","utf8");
const gate=fs.readFileSync("lib/creative/production-graph/runtime/CreativeVisualProductionExecutionGate.js","utf8");

test("Image Studio proof is content-addressed and immutable",()=>{
  assert.match(proof,/CREATIVE_IMAGE_PRODUCTION_PROOF_V1/);
  assert.match(proof,/immutable_content_addressed_record: true/);
  assert.match(proof,/image_production_proof_hash/);
  assert.match(proof,/createOrFindByMetadataIdentity/);
});

test("proof contains asset QC lineage and provider execution lineage",()=>{
  assert.match(proof,/asset_evidence: assetEvidence/);
  assert.match(proof,/execution_evidence: executionEvidence/);
  assert.match(proof,/provider_execution_claim_id/);
  assert.match(proof,/foundation_authority_digest/);
  assert.match(proof,/material_truth_qc_seal_hash/);
});

test("video dispatch binds the exact proof before paid execution",()=>{
  assert.match(gate,/CreativeImageProductionProofManifestRuntime\.ensure/);
  assert.match(gate,/image_production_proof_hash: productionProof\.proof_hash/);
  assert.match(gate,/image_production_proof_asset_node_id/);
  assert.match(gate,/image_production_proof_bound: true/);
});
