import crypto from "node:crypto";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { CreativeCinemaEngineCertificationRuntime } from "./CreativeCinemaEngineCertificationRuntime";

export const AVANTIQO_CINEMA_ENGINE_CERTIFICATION_LEDGER_CONTRACT =
  "AVANTIQO_CINEMA_ENGINE_CERTIFICATION_LEDGER_V1";
const METADATA_KEY = "cinema_engine_certification_ledger";

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function engineSpec(engineId) {
  return CreativeCinemaEngineCertificationRuntime.engine_specs
    .find((spec) => spec.id === text(engineId).toUpperCase()) || null;
}
function normalizeEvidence(raw = {}) {
  const spec = engineSpec(raw.engine_id);
  if (!spec) throw new Error(`CINEMA_ENGINE_UNKNOWN:${text(raw.engine_id)}`);
  const contracts = [...new Set(list(raw.implementation_contracts).map(text).filter(Boolean))];
  const technicalProofId = text(raw.technical_proof_id);
  const visualProofId = text(raw.visual_proof_id);
  const proofAssetNodeId = text(raw.proof_asset_node_id);
  const proofChecksum = text(raw.proof_checksum);
  if (raw.technical_proof_passed === true && !technicalProofId) {
    throw new Error(`CINEMA_ENGINE_TECHNICAL_PROOF_ID_REQUIRED:${spec.id}`);
  }
  if (spec.visual && raw.visual_proof_passed === true && !visualProofId && !proofAssetNodeId) {
    throw new Error(`CINEMA_ENGINE_VISUAL_PROOF_REFERENCE_REQUIRED:${spec.id}`);
  }
  const body = {
    engine_id: spec.id,
    implementation_contracts: contracts,
    technical_proof_passed: raw.technical_proof_passed === true,
    technical_proof_id: technicalProofId || null,
    visual_proof_passed: raw.visual_proof_passed === true,
    visual_proof_id: visualProofId || null,
    proof_asset_node_id: proofAssetNodeId || null,
    proof_checksum: proofChecksum || null,
    provider_calls_performed: raw.provider_calls_performed === true,
    verified_at: text(raw.verified_at) || new Date().toISOString(),
    notes: text(raw.notes) || null,
  };
  return { ...body, evidence_hash: hash(body) };
}
function ledgerFrom(project = {}) {
  const ledger = object(project.metadata?.[METADATA_KEY]);
  return {
    contract: AVANTIQO_CINEMA_ENGINE_CERTIFICATION_LEDGER_CONTRACT,
    revision: Number(ledger.revision || 0),
    evidence: object(ledger.evidence),
    updated_at: text(ledger.updated_at) || null,
  };
}

async function projectInScope({ organization_id, creative_project_id }) {
  const project = await CreativeProjectRepository.getById(creative_project_id);
  if (!project || text(project.organization_id) !== text(organization_id)) {
    throw new Error("Creative project not found");
  }
  return project;
}

export async function inspectCinemaEngineCertificationLedger({
  organization_id,
  creative_project_id,
} = {}) {
  const project = await projectInScope({ organization_id, creative_project_id });
  const ledger = ledgerFrom(project);
  const evidence = Object.values(ledger.evidence);
  const certification = CreativeCinemaEngineCertificationRuntime.certify({ evidence });
  return {
    ...ledger,
    project_id: project.id,
    organization_id: project.organization_id,
    certification,
  };
}
export async function recordCinemaEngineCertificationEvidence({
  organization_id,
  creative_project_id,
  evidence,
} = {}) {
  const project = await projectInScope({ organization_id, creative_project_id });
  const current = ledgerFrom(project);
  const normalized = normalizeEvidence(evidence);
  const nextEvidence = {
    ...current.evidence,
    [normalized.engine_id]: normalized,
  };
  const updatedAt = new Date().toISOString();
  const next = {
    contract: AVANTIQO_CINEMA_ENGINE_CERTIFICATION_LEDGER_CONTRACT,
    revision: current.revision + 1,
    evidence: nextEvidence,
    updated_at: updatedAt,
  };
  await CreativeProjectRepository.update(project.id, {
    metadata: {
      ...object(project.metadata),
      [METADATA_KEY]: next,
      cinema_engine_certification_updated_at: updatedAt,
    },
  });
  const certification = CreativeCinemaEngineCertificationRuntime.certify({
    evidence: Object.values(nextEvidence),
  });
  return { ...next, project_id: project.id, organization_id: project.organization_id, certification };
}

export const CreativeCinemaEngineCertificationLedgerRuntime = Object.freeze({
  contract: AVANTIQO_CINEMA_ENGINE_CERTIFICATION_LEDGER_CONTRACT,
  inspect: inspectCinemaEngineCertificationLedger,
  record: recordCinemaEngineCertificationEvidence,
});
