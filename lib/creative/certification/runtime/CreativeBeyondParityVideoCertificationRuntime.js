import crypto from "node:crypto";

export const AVANTIQO_BEYOND_PARITY_VIDEO_CERTIFICATION_CONTRACT =
  "AVANTIQO_BEYOND_PARITY_VIDEO_CERTIFICATION_V1";

const SPECS = Object.freeze([
  Object.freeze({
    id: "COMPLEX_MATERIALX_GRAPH_TRANSLATION",
    contract: "AVANTIQO_MATERIALX_GRAPH_TRANSLATION_V1",
  }),
  Object.freeze({
    id: "NATIVE_AXF_SDK_INGEST",
    contract: "AVANTIQO_NATIVE_AXF_SDK_INGEST_V1",
  }),
  Object.freeze({
    id: "OPENVDB_USD_VOLUMETRIC_WORKFLOWS",
    contract: "AVANTIQO_OPENVDB_USD_VOLUME_WORKFLOW_V1",
  }),
  Object.freeze({
    id: "MULTICAMERA_STEREO_VIRTUAL_PRODUCTION",
    contract: "AVANTIQO_MULTICAMERA_STEREO_VIRTUAL_PRODUCTION_V1",
  }),
]);

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function hash(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function evaluateOne(spec, evidence = {}) {
  const ev = object(evidence);
  const blockers = [];
  if (text(ev.contract) !== spec.contract) blockers.push("BEYOND_PARITY_CONTRACT_EVIDENCE_REQUIRED:" + spec.id);
  if (ev.status !== "READY") blockers.push("BEYOND_PARITY_RUNTIME_NOT_READY:" + spec.id);
  if (ev.technical_proof_passed !== true) blockers.push("BEYOND_PARITY_TECHNICAL_PROOF_REQUIRED:" + spec.id);

  if (spec.id === "COMPLEX_MATERIALX_GRAPH_TRANSLATION") {
    if (!text(ev.graph_hash)) blockers.push("MATERIALX_GRAPH_HASH_REQUIRED");
    if (ev.cycles_graph_execution_verified !== true) blockers.push("MATERIALX_CYCLES_EXECUTION_PROOF_REQUIRED");
  }
  if (spec.id === "NATIVE_AXF_SDK_INGEST") {
    if (ev.native_axf_decode_performed !== true || ev.native_axf_decode_claimed !== true) {
      blockers.push("NATIVE_AXF_LICENSED_DECODE_PROOF_REQUIRED");
    }
    if (!text(ev.decode_evidence_hash)) blockers.push("NATIVE_AXF_DECODE_EVIDENCE_HASH_REQUIRED");
  }
  if (spec.id === "OPENVDB_USD_VOLUMETRIC_WORKFLOWS") {
    if (ev.openvdb_native_assets !== true || ev.usd_volume_schema_authored !== true) {
      blockers.push("OPENVDB_USD_VOLUME_PROOF_REQUIRED");
    }
    if (ev.cycles_volume_execution_verified !== true) blockers.push("OPENVDB_CYCLES_EXECUTION_PROOF_REQUIRED");
  }
  if (spec.id === "MULTICAMERA_STEREO_VIRTUAL_PRODUCTION") {
    if (!text(ev.workflow_hash)) blockers.push("MULTICAMERA_WORKFLOW_HASH_REQUIRED");
    if (ev.multicamera_render_verified !== true) blockers.push("MULTICAMERA_RENDER_PROOF_REQUIRED");
    if (ev.stereo_multiview_verified !== true) blockers.push("STEREO_MULTIVIEW_PROOF_REQUIRED");
    if (ev.virtual_production_verified !== true) blockers.push("VIRTUAL_PRODUCTION_SYNC_PROOF_REQUIRED");
  }
  return {
    id: spec.id,
    contract: spec.contract,
    implemented: text(ev.contract) === spec.contract,
    certified: blockers.length === 0,
    blockers,
    evidence: ev,
  };
}

export function certifyBeyondParityVideo({ evidence = {} } = {}) {
  const upgrades = SPECS.map((spec) => evaluateOne(spec, evidence[spec.id]));
  const upgradeEvidence = Object.fromEntries(upgrades.map((item) => [
    item.id,
    {
      implemented: item.implemented,
      certified: item.certified,
      contract: item.contract,
      blockers: item.blockers,
      evidence: item.evidence,
    },
  ]));
  const body = {
    contract: AVANTIQO_BEYOND_PARITY_VIDEO_CERTIFICATION_CONTRACT,
    upgrades,
    upgrade_evidence: upgradeEvidence,
    certified: upgrades.every((item) => item.certified),
    blocked_upgrade_ids: upgrades.filter((item) => !item.certified).map((item) => item.id),
    policy: {
      licensed_sdk_claims_require_live_decode_evidence: true,
      implementation_does_not_equal_certification: true,
      render_execution_proof_required_for_visual_engines: true,
    },
  };
  return {
    ...body,
    status: body.certified ? "BEYOND_PARITY_CERTIFIED" : "BLOCKED",
    certification_hash: hash(body),
  };
}

export const CreativeBeyondParityVideoCertificationRuntime = Object.freeze({
  contract: AVANTIQO_BEYOND_PARITY_VIDEO_CERTIFICATION_CONTRACT,
  specs: SPECS,
  certify: certifyBeyondParityVideo,
});
