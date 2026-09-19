import { createHash } from "node:crypto";
import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import { buildMusicTransformationPlan, musicCapabilityState } from "@/lib/creative/runtime/engines/MusicEngine";

const CONTRACT = "AVANTIQO_MUSIC_SURGICAL_REPAIR_V1";
function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
function hash(value) { return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex"); }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function normalizeRegions(regions = [], duration = null) {
  const rows = list(regions).map((row) => ({
    family: text(row.family).toUpperCase(),
    start_seconds: finite(row.start_seconds),
    end_seconds: finite(row.end_seconds),
    evidence: text(row.evidence),
  })).filter((row) => row.start_seconds !== null && row.end_seconds !== null && row.start_seconds >= 0 && row.end_seconds > row.start_seconds);
  rows.sort((a, b) => a.start_seconds - b.start_seconds || a.end_seconds - b.end_seconds);
  return rows.filter((row) => duration === null || row.start_seconds < duration).map((row) => ({
    ...row,
    end_seconds: duration === null ? row.end_seconds : Math.min(duration, row.end_seconds),
  })).filter((row) => row.end_seconds > row.start_seconds);
}

async function exactAsset({ organization_id, creative_project_id, master_asset_id }) {
  const asset = await CreativeAssetsRuntime.get(master_asset_id);
  if (!asset || text(asset.organization_id) !== text(organization_id) || text(asset.creative_project_id) !== text(creative_project_id)) {
    throw new Error("CREATIVE_MUSIC_SURGICAL_REPAIR_ASSET_NOT_FOUND");
  }
  return asset;
}
export async function planMusicSurgicalRepair({ organization_id, creative_project_id, master_asset_id, source_rights_confirmed = false } = {}) {
  if (!organization_id || !creative_project_id || !master_asset_id) throw new Error("CREATIVE_MUSIC_SURGICAL_REPAIR_CONTEXT_REQUIRED");
  const asset = await exactAsset({ organization_id, creative_project_id, master_asset_id });
  const metadata = asset.metadata || {};
  const dailiesStatus = text(metadata.music_dailies_status);
  const repairBrief = metadata.music_dailies_repair_brief || {};
  if (dailiesStatus !== "REJECTED_FOR_REPAIR") throw new Error("CREATIVE_MUSIC_SURGICAL_REPAIR_DAILIES_REJECTION_REQUIRED");
  const duration = finite(metadata.duration_seconds);
  const regions = normalizeRegions(repairBrief.regions, duration);
  const musicalFamilies = new Set(["MUSICALITY", "PERFORMANCE", "SONIC_IDENTITY", "INTENT_FIDELITY"]);
  const musicalRegions = regions.filter((row) => musicalFamilies.has(row.family));
  const selected = musicalRegions[0] || null;
  const editState = musicCapabilityState().edit;
  const blockers = [];
  if (!selected) blockers.push("EXACT_FAILED_REGION_REQUIRED");
  if (source_rights_confirmed !== true) blockers.push("SOURCE_RIGHTS_CONFIRMATION_REQUIRED");
  if (editState !== "CERTIFIED") blockers.push(`AI_AUDIO_EDIT_${editState || "NOT_READY"}`);
  const operation = selected ? {
    capability: "ai.audio.edit",
    source_audio: asset.file_url,
    edit_start_seconds: selected.start_seconds,
    edit_end_seconds: selected.end_seconds,
    family: selected.family,
    evidence: selected.evidence,
    preserve_outside_region: true,
    rerun_dailies_after_execution: true,
  } : null;
  const planCore = {
    contract: CONTRACT,
    organization_id,
    creative_project_id,
    master_asset_id,
    source_asset_url: asset.file_url,
    selected_region: selected,
    remaining_regions: selected ? musicalRegions.slice(1) : musicalRegions,
    next_operation: operation,
    direction_hash: metadata.music_direction_hash || null,
    preproduction_hash: metadata.music_preproduction_hash || null,
    blockers,
  };
  return {
    ...planCore,
    repair_plan_hash: hash(planCore),
    execution_ready: blockers.length === 0,
    certification: editState,
    paid_generation_required: true,
    estimated_provider_jobs: operation ? 1 : 0,
    publication_authorized: false,
  };
}
export function buildCertifiedSurgicalEdit(plan = {}, { source_rights_confirmed = false } = {}) {
  if (plan.execution_ready !== true || !plan.next_operation) {
    const error = new Error(`CREATIVE_MUSIC_SURGICAL_REPAIR_NOT_READY:${list(plan.blockers).join(",")}`);
    error.status = 503;
    error.code = "CREATIVE_MUSIC_SURGICAL_REPAIR_NOT_READY";
    throw error;
  }
  const operation = plan.next_operation;
  const transform = buildMusicTransformationPlan("edit", {
    source_audio: operation.source_audio,
    source_rights_confirmed,
    edit_start_seconds: operation.edit_start_seconds,
    edit_end_seconds: operation.edit_end_seconds,
    title: "Surgical Music repair",
    instrumental: true,
  });
  if (transform.executable !== true || transform.certification !== "CERTIFIED") {
    const error = new Error(`CREATIVE_MUSIC_SURGICAL_REPAIR_NOT_CERTIFIED:${transform.certification}`);
    error.status = 503;
    error.code = "CREATIVE_MUSIC_SURGICAL_REPAIR_NOT_CERTIFIED";
    throw error;
  }
  return transform;
}

export const CreativeMusicSurgicalRepairRuntime = Object.freeze({
  contract: CONTRACT,
  plan: planMusicSurgicalRepair,
  buildCertifiedEdit: buildCertifiedSurgicalEdit,
});
