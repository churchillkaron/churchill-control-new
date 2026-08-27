export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { validateMusicAutomation } from "@/lib/creative/music/runtime/CreativeMusicAutomationRuntime";
import { validateMusicGroupProcessing } from "@/lib/creative/music/runtime/CreativeMusicBusProcessingRuntime";
import { validateMusicClipEdit } from "@/lib/creative/music/runtime/CreativeMusicClipEditRuntime";
import { ensureMusicEngineeringBuses, validateMusicMixerRouting } from "@/lib/creative/music/runtime/CreativeMusicMixerRoutingRuntime";
import { validateMusicMultitrackProject } from "@/lib/creative/music/runtime/CreativeMusicMultitrackRuntime";
import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { ownedProviderForCapability } from "@/lib/platform/service-runtime/providers/AvantiqoOwnedProviderPolicy";
import { resolveProvider } from "@/lib/platform/service-runtime/providers/ProviderResolver";
import { OrganizationServiceRuntime } from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const EXECUTION_PERMISSIONS = Object.freeze(["creative.execute", "creative.production.run", "creative.*"]);
const METADATA_KEY = "music_multitrack_project";
const CAPABILITY = "ai.audio.vocal-correct";
const TUNING_PLAN_CONTRACT = "AVANTIQO_MUSIC_VOCAL_TUNING_PLAN_V1";
const TIMING_PLAN_CONTRACT = "AVANTIQO_MUSIC_VOCAL_TIMING_PLAN_V1";
const RENDER_REQUEST_CONTRACT = "AVANTIQO_MUSIC_VOCAL_TUNING_RENDER_REQUEST_V1";
const RENDER_RESULT_CONTRACT = "AVANTIQO_MUSIC_VOCAL_TUNING_RENDER_RESULT_V1";
const ENGINE_CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2";
const QUALITY_PROFILE = "TORCHCREPE_SIGNALSMITH_VOCAL_CORRECTION_V2";
const RIGHTS_CONTRACT = "AVANTIQO_SOURCE_AUDIO_RIGHTS_ATTESTATION_V1";
const CONTENT_POLICY = "USER_RIGHTS_ATTESTATION_ONLY";

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = null) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function enabled(value) { return ["1", "true", "yes", "on"].includes(text(value).toLowerCase()); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function errorStatus(error) {
  const value = text(error?.message).toUpperCase();
  if (error?.status) return error.status;
  if (value.includes("NOT_CERTIFIED") || value.includes("ENGINE_DISABLED") || value.includes("SAFE_LEASE")) return 503;
  if (value.includes("WALLET") || value.includes("BALANCE")) return 402;
  if (value.includes("FORBIDDEN") || value.includes("PERMISSION") || value.includes("UNAUTHORIZED")) return 403;
  if (value.includes("NOT_FOUND")) return 404;
  if (value.includes("CONFLICT") || value.includes("STALE") || value.includes("CHANGED")) return 409;
  return 400;
}

async function requireAccess(request, organizationId) {
  const access = await requireOrganizationAccess({
    organizationId,
    request,
    requiredAnyPermission: EXECUTION_PERMISSIONS,
  });
  if (!access.success) {
    const error = new Error(access.error || "CREATIVE_MUSIC_VOCAL_TUNING_RENDER_ACCESS_FORBIDDEN");
    error.status = access.status || 403;
    throw error;
  }
}

async function projectInScope(organizationId, projectId) {
  if (!projectId) throw new Error("creative_project_id required");
  const project = await CreativeProjectRepository.getById(projectId);
  if (!project || String(project.organization_id) !== String(organizationId)) {
    const error = new Error("CREATIVE_MUSIC_VOCAL_TUNING_RENDER_PROJECT_NOT_FOUND");
    error.status = 404;
    throw error;
  }
  return project;
}

function normalizeSession(session) {
  const next = ensureMusicEngineeringBuses(session);
  validateMusicMultitrackProject(next);
  validateMusicMixerRouting(next);
  validateMusicGroupProcessing(next);
  validateMusicAutomation(next);
  for (const track of next.tracks || []) validateMusicClipEdit(track);
  return next;
}

function selectVocalClip(session, trackId, clipId) {
  const track = session.tracks?.find((entry) => entry.id === trackId);
  const clip = track?.clips?.find((entry) => entry.id === clipId);
  if (!track || !clip) throw new Error("CREATIVE_MUSIC_VOCAL_TUNING_RENDER_CLIP_NOT_FOUND");
  if (track.type !== "vocal") throw new Error("CREATIVE_MUSIC_VOCAL_TUNING_RENDER_VOCAL_TRACK_REQUIRED");
  return { track, clip };
}

function currentPlan(clip) {
  const plan = clip?.vocal_tuning_plan;
  if (!plan || plan.contract !== TUNING_PLAN_CONTRACT) {
    throw new Error("CREATIVE_MUSIC_VOCAL_TUNING_RENDER_PLAN_REQUIRED");
  }
  if (plan.source_asset_id !== clip.source_asset_id) throw new Error("CREATIVE_MUSIC_VOCAL_TUNING_RENDER_PLAN_STALE");
  if (Math.abs(finite(plan.source_offset_seconds, -1) - finite(clip.source_offset_seconds, 0)) > 0.001) throw new Error("CREATIVE_MUSIC_VOCAL_TUNING_RENDER_PLAN_SOURCE_OFFSET_STALE");
  if (Math.abs(finite(plan.source_duration_seconds, -1) - finite(clip.duration_seconds, 0)) > 0.01) throw new Error("CREATIVE_MUSIC_VOCAL_TUNING_RENDER_PLAN_SOURCE_DURATION_STALE");
  if (plan.all_segments_reviewed !== true) throw new Error("CREATIVE_MUSIC_VOCAL_TUNING_RENDER_REVIEW_INCOMPLETE");
  const unapproved = (plan.segments || []).filter((segment) => Math.abs(finite(segment.proposed_correction_cents, 0)) > 0.01 && segment.approved !== true);
  if (unapproved.length) throw new Error("CREATIVE_MUSIC_VOCAL_TUNING_RENDER_UNAPPROVED_SEGMENTS");
  return plan;
}

function currentTimingPlan(clip) {
  const plan = clip?.vocal_timing_plan;
  if (!plan) return null;
  if (plan.contract !== TIMING_PLAN_CONTRACT) throw new Error("CREATIVE_MUSIC_VOCAL_TIMING_RENDER_PLAN_CONTRACT_INVALID");
  if (plan.source_asset_id !== clip.source_asset_id) throw new Error("CREATIVE_MUSIC_VOCAL_TIMING_RENDER_PLAN_STALE");
  if (Math.abs(finite(plan.source_offset_seconds, -1) - finite(clip.source_offset_seconds, 0)) > 0.001) throw new Error("CREATIVE_MUSIC_VOCAL_TIMING_RENDER_PLAN_SOURCE_OFFSET_STALE");
  if (Math.abs(finite(plan.source_duration_seconds, -1) - finite(clip.duration_seconds, 0)) > 0.01) throw new Error("CREATIVE_MUSIC_VOCAL_TIMING_RENDER_PLAN_SOURCE_DURATION_STALE");
  if (plan.musician_approval_required !== true || plan.auto_apply_forbidden !== true || plan.whole_phrase_translation_only !== true || plan.time_stretch_used === true) {
    throw new Error("CREATIVE_MUSIC_VOCAL_TIMING_RENDER_PLAN_GOVERNANCE_INVALID");
  }
  if (plan.all_phrases_reviewed !== true) throw new Error("CREATIVE_MUSIC_VOCAL_TIMING_RENDER_REVIEW_INCOMPLETE");
  const unapproved = (plan.phrases || []).filter((phrase) => Math.abs(finite(phrase.proposed_shift_ms, 0)) > 0.1 && phrase.approved !== true);
  if (unapproved.length) throw new Error("CREATIVE_MUSIC_VOCAL_TIMING_RENDER_UNAPPROVED_PHRASES");
  return plan;
}

function readinessBase() {
  const engineEnabled = enabled(process.env.AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_ENABLED);
  const engineCertified = enabled(process.env.AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_CERTIFIED);
  return {
    ready: false,
    engine_enabled: engineEnabled,
    engine_certified: engineCertified,
    engine_contract: ENGINE_CONTRACT,
    quality_profile: QUALITY_PROFILE,
    organization_service_enabled: false,
    organization_service_active: false,
    organization_usage_enabled: false,
    owned_provider_required: ownedProviderForCapability(CAPABILITY),
    owned_provider_selected: null,
    production_pricing_ready: false,
    pricing_id: null,
    model: null,
    currency: null,
    blocker: !engineEnabled
      ? "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_DISABLED"
      : !engineCertified
        ? "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_NOT_CERTIFIED"
        : null,
    blocker_detail: null,
    human_listening_certification_required: !engineCertified,
    formant_preservation_claimed: false,
  };
}

async function readiness({ organizationId, currency = "THB" } = {}) {
  const state = readinessBase();
  if (state.blocker) return state;
  if (!organizationId) return { ...state, blocker: "AVANTIQO_MUSIC_VOCAL_CORRECTION_ORGANIZATION_REQUIRED" };

  let organizationService;
  try {
    organizationService = await OrganizationServiceRuntime.get({ organization_id: organizationId, service_id: CAPABILITY });
  } catch (error) {
    return {
      ...state,
      blocker: "AVANTIQO_MUSIC_VOCAL_CORRECTION_SERVICE_LOOKUP_FAILED",
      blocker_detail: text(error?.message) || null,
    };
  }

  if (!organizationService) {
    return { ...state, blocker: "AVANTIQO_MUSIC_VOCAL_CORRECTION_SERVICE_NOT_ENABLED" };
  }
  const serviceActive = text(organizationService.status).toUpperCase() === "ACTIVE";
  const usageEnabled = organizationService.usage_enabled !== false;
  const serviceState = {
    ...state,
    organization_service_enabled: true,
    organization_service_active: serviceActive,
    organization_usage_enabled: usageEnabled,
  };
  if (!serviceActive) return { ...serviceState, blocker: "AVANTIQO_MUSIC_VOCAL_CORRECTION_SERVICE_NOT_ACTIVE" };
  if (!usageEnabled) return { ...serviceState, blocker: "AVANTIQO_MUSIC_VOCAL_CORRECTION_SERVICE_USAGE_DISABLED" };

  const ownedProvider = state.owned_provider_required;
  if (!ownedProvider) return { ...serviceState, blocker: "AVANTIQO_MUSIC_VOCAL_CORRECTION_OWNED_PROVIDER_POLICY_MISSING" };

  let selected;
  try {
    selected = await resolveProvider({
      organization_id: organizationId,
      capability: CAPABILITY,
      preferredProvider: ownedProvider,
      currency: text(currency || "THB") || "THB",
      policy: {
        ...(object(organizationService.provider_policy)),
        allowed_providers: [ownedProvider],
        preferred_providers: [ownedProvider],
      },
    });
  } catch (error) {
    return {
      ...serviceState,
      blocker: "AVANTIQO_MUSIC_VOCAL_CORRECTION_PRODUCTION_PRICING_OR_PROVIDER_NOT_READY",
      blocker_detail: text(error?.message) || null,
    };
  }

  if (text(selected?.provider) !== ownedProvider) {
    return {
      ...serviceState,
      owned_provider_selected: text(selected?.provider) || null,
      blocker: "AVANTIQO_MUSIC_VOCAL_CORRECTION_OWNED_PROVIDER_NOT_SELECTED",
    };
  }

  return {
    ...serviceState,
    ready: true,
    owned_provider_selected: selected.provider,
    production_pricing_ready: Boolean(selected.pricing_id && selected.pricing_record),
    pricing_id: selected.pricing_id || null,
    model: selected.model || null,
    currency: selected.currency || text(currency || "THB") || "THB",
    blocker: null,
    blocker_detail: null,
  };
}

function assetProjectId(asset) { return text(asset?.creative_project_id || asset?.metadata?.creative_project_id); }

async function sourceAssetInScope(organizationId, projectId, assetId) {
  const asset = await CreativeAssetsRuntime.get(assetId);
  if (!asset || String(asset.organization_id) !== String(organizationId) || assetProjectId(asset) !== String(projectId)) throw new Error("CREATIVE_MUSIC_VOCAL_TUNING_RENDER_SOURCE_ASSET_NOT_FOUND");
  return asset;
}

async function sourceRightsConfirmed(asset, organizationId, projectId, seen = new Set()) {
  if (!asset?.id || seen.has(asset.id) || seen.size >= 8) return false;
  seen.add(asset.id);
  const metadata = object(asset.metadata);
  if (metadata.source_rights_confirmed === true || metadata.source_is_user_recording === true) return true;
  const parentId = text(metadata.source_asset_id || metadata.correction_source_asset_id || metadata.original_source_asset_id);
  if (!parentId) return false;
  try {
    const parent = await sourceAssetInScope(organizationId, projectId, parentId);
    return sourceRightsConfirmed(parent, organizationId, projectId, seen);
  } catch {
    return false;
  }
}

function providerParameters({ session, clip, plan, timingPlan }) {
  return {
    rights_attestation: { contract: RIGHTS_CONTRACT, confirmed: true, content_restriction_policy: CONTENT_POLICY },
    correction: {
      source_role: "isolated_vocal",
      key: `${text(plan.musical_key?.key)} ${text(plan.musical_key?.mode)}`.trim(),
      bpm: finite(session.bpm, null),
      beat_offset_seconds: 0,
      pitch_strength: finite(plan.settings?.correction_strength, 0.8),
      timing_strength: 0,
      max_pitch_shift_cents: finite(plan.settings?.max_correction_cents, 200),
      max_timing_shift_ms: finite(timingPlan?.settings?.max_shift_ms, 80),
      snap_threshold_cents: finite(plan.settings?.preserve_within_cents, 10),
      preserve_vibrato: true,
      preserve_formants: true,
    },
    source_window: {
      source_asset_id: clip.source_asset_id,
      offset_seconds: finite(clip.source_offset_seconds, 0),
      duration_seconds: finite(clip.duration_seconds, 0),
    },
    approved_tuning_plan: plan,
    approved_timing_plan: timingPlan || null,
  };
}

function pendingRequestFromExecution({ execution, planFingerprint, timingPlanFingerprint, clip, revision }) {
  return {
    contract: RENDER_REQUEST_CONTRACT,
    id: randomUUID(),
    status: execution.pending === true ? "PENDING" : execution.failed === true ? "FAILED" : "COMPLETED_PENDING_APPLY",
    submitted_at: new Date().toISOString(),
    source_project_revision: revision,
    source_asset_id: clip.source_asset_id,
    source_offset_seconds: finite(clip.source_offset_seconds, 0),
    source_duration_seconds: finite(clip.duration_seconds, 0),
    tuning_plan_fingerprint: planFingerprint,
    timing_plan_fingerprint: timingPlanFingerprint || null,
    usage_id: execution.usage?.id || null,
    provider: execution.provider || null,
    provider_job_id: execution.provider_job_id || null,
    provider_status: execution.provider_status || null,
    pricing: execution.pricing || null,
    quantity: execution.usage?.quantity ?? clip.duration_seconds,
    unit: execution.usage?.unit || null,
    credential_id: execution.credential_id || null,
    started_at: execution.started_at || new Date().toISOString(),
    settlement: execution.settlement || null,
    engine_contract: ENGINE_CONTRACT,
    quality_profile: QUALITY_PROFILE,
    execution_mode: "MUSICIAN_APPROVED_PLAN",
  };
}

async function persistRequest(project, session, trackId, clipId, renderRequest) {
  const next = structuredClone(session);
  selectVocalClip(next, trackId, clipId).clip.vocal_tuning_render_request = renderRequest;
  next.revision = Math.max(0, Math.round(finite(session.revision, 0))) + 1;
  normalizeSession(next);
  await CreativeProjectRepository.update(project.id, { metadata: { ...(project.metadata || {}), [METADATA_KEY]: next, music_multitrack_updated_at: new Date().toISOString() } });
  return next;
}

function settledProviderOutput(settled) {
  const raw = object(settled?.output?.raw);
  const providerOutput = object(raw.output);
  const corrected = object(providerOutput.corrected_vocal);
  const reportAsset = object(providerOutput.correction_report);
  return {
    correctedReference: text(corrected.storage_reference || providerOutput.corrected_vocal_wav),
    reportReference: text(reportAsset.storage_reference || providerOutput.correction_report_json),
    report: object(providerOutput.report),
  };
}

async function existingDerivedAsset(organizationId, projectId, usageId) {
  const assets = await CreativeAssetsRuntime.list({ organization_id: organizationId, creative_project_id: projectId, limit: 1000 });
  return assets.find((asset) => text(asset.metadata?.music_asset_kind) === "VOCAL_TUNING_RENDER" && text(asset.metadata?.service_usage_id) === text(usageId)) || null;
}

async function persistCompletedAsset({ organizationId, projectId, project, sourceAsset, request, settled, output }) {
  const existing = await existingDerivedAsset(organizationId, projectId, request.usage_id);
  if (existing) return existing;
  if (!output.correctedReference.startsWith("storage://creative-assets/")) throw new Error("CREATIVE_MUSIC_VOCAL_TUNING_RENDER_OUTPUT_REFERENCE_INVALID");
  const report = output.report;
  return CreativeAssetsRuntime.create({
    organization_id: organizationId,
    creative_project_id: projectId,
    creative_mission_id: project.creative_mission_id || null,
    asset_type: "AUDIO",
    file_url: output.correctedReference,
    file_name: `vocal-correction-${request.id}.wav`,
    name: `${sourceAsset.name || sourceAsset.title || "Vocal"} — Corrected`,
    title: `${sourceAsset.title || sourceAsset.name || "Vocal"} — Corrected`,
    description: "Musician-reviewed non-destructive vocal pitch and timing render from Avantiqo Music Workstation.",
    ai_generated: false,
    provider: settled.provider || "avantiqo-audio",
    engine: ENGINE_CONTRACT,
    prompt: null,
    metadata: {
      media_kind: "MUSIC", mime_type: "audio/wav", music_asset_kind: "VOCAL_TUNING_RENDER",
      vocal_tuning_render_contract: RENDER_RESULT_CONTRACT, engine_contract: ENGINE_CONTRACT, quality_profile: QUALITY_PROFILE,
      execution_mode: "MUSICIAN_APPROVED_PLAN", source_asset_id: request.source_asset_id,
      source_offset_seconds: request.source_offset_seconds, source_duration_seconds: request.source_duration_seconds,
      tuning_plan_fingerprint: request.tuning_plan_fingerprint, timing_plan_fingerprint: request.timing_plan_fingerprint || null,
      service_usage_id: request.usage_id, provider_job_id: request.provider_job_id, correction_report_json: output.reportReference || null,
      source_checksum: report.source_checksum || null, applied_event_count: finite(report.pitch?.render?.applied_event_count, null),
      approved_event_count: finite(report.pitch?.event_count, null), approved_phrase_move_count: finite(report.approved_timing_plan?.approved_move_count, 0),
      tonality_compensation_applied: report.pitch?.render?.tonality_compensation_applied === true,
      tonality_limit_hz: finite(report.pitch?.render?.tonality_limit_hz ?? report.pitch?.tonality_limit_hz, null),
      formant_preservation_claimed: false, timing_correction_applied: report.timing?.applied === true,
      timing_review_required: true, human_listening_review_required: true, production_certified: report.readiness?.production_certified === true,
      sample_rate: finite(report.pitch?.render?.sample_rate, 48000), channels: finite(report.pitch?.render?.channels, 1), bit_depth: 24,
      duration_seconds: finite(report.duration_seconds, request.source_duration_seconds), source_rights_confirmed: true,
      source_assets_preserved: true, derived_asset: true, destructive_edit: false, rendered_at: new Date().toISOString(),
    },
    tags: ["music", "vocal", "correction", "pitch", "timing", "derived", "24-bit", "musician-reviewed"],
  });
}

async function applyCompletedToCurrentClip({ organizationId, projectId, trackId, clipId, request, derivedAsset, report }) {
  const project = await projectInScope(organizationId, projectId);
  const session = normalizeSession(project.metadata?.[METADATA_KEY]);
  const { clip } = selectVocalClip(session, trackId, clipId);
  if (clip.source_asset_id === derivedAsset.id && clip.vocal_tuning_applied?.service_usage_id === request.usage_id) return { project, session, applied: true, already_applied: true };
  if (clip.source_asset_id !== request.source_asset_id) return { project, session, applied: false, blocker: "CURRENT_CLIP_SOURCE_CHANGED" };
  if (fingerprint(currentPlan(clip)) !== request.tuning_plan_fingerprint) return { project, session, applied: false, blocker: "CURRENT_TUNING_PLAN_CHANGED" };
  if (request.timing_plan_fingerprint) {
    let timingPlan;
    try { timingPlan = currentTimingPlan(clip); } catch { return { project, session, applied: false, blocker: "CURRENT_TIMING_PLAN_CHANGED" }; }
    if (!timingPlan || fingerprint(timingPlan) !== request.timing_plan_fingerprint) return { project, session, applied: false, blocker: "CURRENT_TIMING_PLAN_CHANGED" };
  }

  const next = structuredClone(session);
  const nextClip = selectVocalClip(next, trackId, clipId).clip;
  nextClip.source_asset_history = [
    ...(Array.isArray(nextClip.source_asset_history) ? nextClip.source_asset_history : []),
    {
      source_asset_id: request.source_asset_id,
      source_offset_seconds: request.source_offset_seconds,
      duration_seconds: request.source_duration_seconds,
      replaced_by_tuning_asset_id: derivedAsset.id,
      tuning_plan_fingerprint: request.tuning_plan_fingerprint,
      timing_plan_fingerprint: request.timing_plan_fingerprint || null,
      preserved: true,
    },
  ];
  nextClip.source_asset_id = derivedAsset.id;
  nextClip.source_offset_seconds = 0;
  nextClip.duration_seconds = finite(report.duration_seconds, request.source_duration_seconds);
  nextClip.vocal_tuning_applied = {
    contract: RENDER_RESULT_CONTRACT,
    derived_asset_id: derivedAsset.id,
    source_asset_id: request.source_asset_id,
    service_usage_id: request.usage_id,
    provider_job_id: request.provider_job_id,
    tuning_plan_fingerprint: request.tuning_plan_fingerprint,
    timing_plan_fingerprint: request.timing_plan_fingerprint || null,
    applied_event_count: finite(report.pitch?.render?.applied_event_count, null),
    approved_phrase_move_count: finite(report.approved_timing_plan?.approved_move_count, 0),
    formant_preservation_claimed: false,
    timing_correction_applied: report.timing?.applied === true,
    whole_phrase_timing_only: request.timing_plan_fingerprint ? true : null,
    time_stretch_used: report.timing?.time_stretch_used === true,
    human_listening_review_required: true,
    applied_at: new Date().toISOString(),
  };
  nextClip.vocal_tuning_render_request = { ...request, status: "APPLIED", derived_asset_id: derivedAsset.id, completed_at: new Date().toISOString() };
  nextClip.preserve_source_asset = true;
  nextClip.destructive_edit = false;
  next.revision = Math.max(0, Math.round(finite(session.revision, 0))) + 1;
  normalizeSession(next);
  await CreativeProjectRepository.update(project.id, { metadata: { ...(project.metadata || {}), [METADATA_KEY]: next, music_multitrack_updated_at: new Date().toISOString() } });
  return { project, session: next, applied: true, already_applied: false };
}

async function finalizeSettlement({ organizationId, projectId, trackId, clipId, request, settled }) {
  if (settled.pending === true) return { success: true, pending: true, request, provider_status: settled.provider_status || request.provider_status, provider_job_submitted: true, endpoint_mutation_performed: false };
  if (settled.failed === true) return { success: false, pending: false, failed: true, request, error: settled.error || "Vocal correction render failed", provider_job_submitted: true, endpoint_mutation_performed: false };
  const output = settledProviderOutput(settled);
  if (!output.correctedReference) throw new Error("CREATIVE_MUSIC_VOCAL_TUNING_RENDER_OUTPUT_REQUIRED");
  const sourceAsset = await sourceAssetInScope(organizationId, projectId, request.source_asset_id);
  const currentProject = await projectInScope(organizationId, projectId);
  const derivedAsset = await persistCompletedAsset({ organizationId, projectId, project: currentProject, sourceAsset, request, settled, output });
  const applied = await applyCompletedToCurrentClip({ organizationId, projectId, trackId, clipId, request, derivedAsset, report: output.report });
  return {
    success: true,
    pending: false,
    contract: RENDER_RESULT_CONTRACT,
    request_id: request.id,
    usage_id: request.usage_id,
    derived_asset_id: derivedAsset.id,
    applied_to_current_clip: applied.applied === true,
    already_applied: applied.already_applied === true,
    apply_blocker: applied.blocker || null,
    source_asset_preserved: true,
    formant_preservation_claimed: false,
    timing_plan_included: Boolean(request.timing_plan_fingerprint),
    timing_correction_applied: output.report?.timing?.applied === true,
    human_listening_review_required: true,
    provider_job_submitted: true,
    endpoint_mutation_performed: false,
  };
}

async function submitRender(body) {
  const organizationId = text(body.organization_id);
  const projectId = text(body.creative_project_id);
  const trackId = text(body.track_id);
  const clipId = text(body.clip_id);
  const currency = text(body.currency || "THB") || "THB";
  const project = await projectInScope(organizationId, projectId);
  const session = normalizeSession(project.metadata?.[METADATA_KEY]);
  const revision = Math.max(0, Math.round(finite(session.revision, 0)));
  const expected = Math.max(0, Math.round(finite(body.expected_revision, -1)));
  if (revision !== expected) {
    const error = new Error(`CREATIVE_MUSIC_VOCAL_TUNING_RENDER_REVISION_CONFLICT:expected=${expected}:current=${revision}`);
    error.status = 409;
    throw error;
  }
  const { clip } = selectVocalClip(session, trackId, clipId);
  const plan = currentPlan(clip);
  const timingPlan = currentTimingPlan(clip);
  const planFingerprint = fingerprint(plan);
  const timingPlanFingerprint = timingPlan ? fingerprint(timingPlan) : null;
  const gate = await readiness({ organizationId, currency });
  const existing = object(clip.vocal_tuning_render_request);
  if (
    existing.contract === RENDER_REQUEST_CONTRACT && existing.tuning_plan_fingerprint === planFingerprint &&
    (existing.timing_plan_fingerprint || null) === timingPlanFingerprint && existing.source_asset_id === clip.source_asset_id &&
    ["PENDING", "COMPLETED_PENDING_APPLY"].includes(existing.status)
  ) {
    return { success: true, pending: existing.status === "PENDING", idempotent_existing_request: true, request: existing, readiness: gate, provider_job_submitted: Boolean(existing.provider_job_id), endpoint_mutation_performed: false };
  }
  if (!gate.ready) { const error = new Error(gate.blocker); error.status = 503; throw error; }
  const sourceAsset = await sourceAssetInScope(organizationId, projectId, clip.source_asset_id);
  if (!(await sourceRightsConfirmed(sourceAsset, organizationId, projectId))) throw new Error("CREATIVE_MUSIC_VOCAL_TUNING_RENDER_SOURCE_RIGHTS_CONFIRMATION_REQUIRED");

  const execution = await executeService({
    organization_id: organizationId,
    bill_to_organization_id: organizationId,
    entity_id: text(body.entity_id) || null,
    service_id: CAPABILITY,
    capability: CAPABILITY,
    provider_id: gate.owned_provider_selected,
    input: {
      source_audio: sourceAsset.file_url,
      quantity: finite(clip.duration_seconds, 1),
      currency,
      provider_parameters: providerParameters({ session, clip, plan, timingPlan }),
    },
    metadata: {
      module: "CREATIVE",
      operation: "AVANTIQO_MUSIC_WORKSTATION_VOCAL_CORRECTION_RENDER",
      creative_project_id: projectId,
      track_id: trackId,
      clip_id: clipId,
      source_asset_id: sourceAsset.id,
      source_project_revision: revision,
      tuning_plan_fingerprint: planFingerprint,
      tuning_plan_contract: TUNING_PLAN_CONTRACT,
      timing_plan_fingerprint: timingPlanFingerprint,
      timing_plan_contract: timingPlan ? TIMING_PLAN_CONTRACT : null,
      timing_plan_included: Boolean(timingPlan),
      readiness_pricing_id: gate.pricing_id,
      readiness_model: gate.model,
      execution_mode: "MUSICIAN_APPROVED_PLAN",
      original_source_preserved: true,
      timing_auto_apply_forbidden: true,
      whole_phrase_timing_only: timingPlan ? true : null,
    },
  });

  const renderRequest = pendingRequestFromExecution({ execution, planFingerprint, timingPlanFingerprint, clip, revision });
  await persistRequest(project, session, trackId, clipId, renderRequest);
  if (execution.pending === true) {
    return { success: true, pending: true, contract: RENDER_REQUEST_CONTRACT, request: renderRequest, readiness: gate, timing_plan_included: Boolean(timingPlan), provider_job_submitted: true, endpoint_mutation_performed: false };
  }
  return finalizeSettlement({ organizationId, projectId, trackId, clipId, request: renderRequest, settled: { ...execution, pending: false, failed: execution.failed === true } });
}

async function checkRender(body) {
  const organizationId = text(body.organization_id);
  const projectId = text(body.creative_project_id);
  const trackId = text(body.track_id);
  const clipId = text(body.clip_id);
  const project = await projectInScope(organizationId, projectId);
  const session = normalizeSession(project.metadata?.[METADATA_KEY]);
  const { clip } = selectVocalClip(session, trackId, clipId);
  const request = object(clip.vocal_tuning_render_request);
  if (request.contract !== RENDER_REQUEST_CONTRACT || !request.usage_id || !request.provider_job_id) throw new Error("CREATIVE_MUSIC_VOCAL_TUNING_RENDER_PENDING_REQUEST_NOT_FOUND");
  if (body.request_id && text(body.request_id) !== text(request.id)) throw new Error("CREATIVE_MUSIC_VOCAL_TUNING_RENDER_REQUEST_ID_MISMATCH");
  if (request.status === "APPLIED" && request.derived_asset_id) {
    return { success: true, pending: false, contract: RENDER_RESULT_CONTRACT, request_id: request.id, derived_asset_id: request.derived_asset_id, applied_to_current_clip: true, already_applied: true, timing_plan_included: Boolean(request.timing_plan_fingerprint), source_asset_preserved: true, provider_job_submitted: true, endpoint_mutation_performed: false };
  }
  const settled = await settlePendingService({
    organization_id: organizationId,
    provider: request.provider,
    provider_job_id: request.provider_job_id,
    usage_id: request.usage_id,
    pricing: request.pricing || {},
    quantity: request.quantity,
    unit: request.unit,
    credential_id: request.credential_id || null,
    started_at: request.started_at || null,
    metadata: {
      module: "CREATIVE",
      operation: "AVANTIQO_MUSIC_WORKSTATION_VOCAL_CORRECTION_RENDER_STATUS",
      creative_project_id: projectId,
      track_id: trackId,
      clip_id: clipId,
      tuning_plan_fingerprint: request.tuning_plan_fingerprint,
      timing_plan_fingerprint: request.timing_plan_fingerprint || null,
    },
  });
  return finalizeSettlement({ organizationId, projectId, trackId, clipId, request, settled });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id);
    if (!organizationId) return NextResponse.json({ success: false, error: "organization_id required" }, { status: 400 });
    await requireAccess(request, organizationId);
    const action = text(body.action || "readiness").toLowerCase();
    const result = action === "readiness"
      ? {
          success: true,
          contract: "AVANTIQO_MUSIC_VOCAL_TUNING_RENDER_READINESS_V2",
          readiness: await readiness({ organizationId, currency: text(body.currency || "THB") || "THB" }),
          provider_job_submitted: false,
          endpoint_mutation_performed: false,
        }
      : action === "submit" ? await submitRender(body)
        : action === "status" ? await checkRender(body) : null;
    if (!result) return NextResponse.json({ success: false, error: "CREATIVE_MUSIC_VOCAL_TUNING_RENDER_ACTION_INVALID" }, { status: 400 });
    return NextResponse.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Music vocal correction render failed", provider_job_submitted: false, endpoint_mutation_performed: false }, { status: errorStatus(error) });
  }
}
