export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { ensureMusicEngineeringBuses, validateMusicMixerRouting } from "@/lib/creative/music/runtime/CreativeMusicMixerRoutingRuntime";
import { validateMusicMultitrackProject } from "@/lib/creative/music/runtime/CreativeMusicMultitrackRuntime";
import {
  analyzeMusicElasticAudio,
  buildMusicElasticWarpPlan,
  reviewMusicElasticWarpMarker,
} from "@/lib/creative/music/runtime/CreativeMusicElasticAudioRuntime";
import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { ownedProviderForCapability } from "@/lib/platform/service-runtime/providers/AvantiqoOwnedProviderPolicy";
import { resolveProvider } from "@/lib/platform/service-runtime/providers/ProviderResolver";
import { OrganizationServiceRuntime } from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const PERMISSIONS = Object.freeze(["creative.execute", "creative.production.run", "creative.*"]);
const METADATA_KEY = "music_multitrack_project";
const CAPABILITY = "ai.audio.elastic-warp";
const PLAN_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_WARP_PLAN_V1";
const ENGINE_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_AUDIO_ENGINE_V1";
const RENDER_REPORT_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_AUDIO_RENDER_REPORT_V1";
const RENDER_REQUEST_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_AUDIO_RENDER_REQUEST_V1";
const RENDER_RESULT_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_AUDIO_RENDER_RESULT_V1";
const RIGHTS_CONTRACT = "AVANTIQO_SOURCE_AUDIO_RIGHTS_ATTESTATION_V1";
const CONTENT_POLICY = "USER_RIGHTS_ATTESTATION_ONLY";

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function enabled(value) { return ["1", "true", "yes", "on"].includes(text(value).toLowerCase()); }

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
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
  const access = await requireOrganizationAccess({ organizationId, request, requiredAnyPermission: PERMISSIONS });
  if (!access.success) { const error = new Error(access.error || "CREATIVE_MUSIC_ELASTIC_ACCESS_FORBIDDEN"); error.status = access.status || 403; throw error; }
  return access;
}

async function projectInScope(organizationId, projectId) {
  if (!projectId) throw new Error("creative_project_id required");
  const project = await CreativeProjectRepository.getById(projectId);
  if (!project || String(project.organization_id) !== String(organizationId)) { const error = new Error("CREATIVE_MUSIC_ELASTIC_PROJECT_NOT_FOUND"); error.status = 404; throw error; }
  return project;
}

function normalizedSession(value) {
  const session = ensureMusicEngineeringBuses(value);
  validateMusicMultitrackProject(session);
  validateMusicMixerRouting(session);
  return session;
}

function selectClip(session, trackId, clipId) {
  const track = session.tracks?.find((entry) => entry.id === trackId);
  const clip = track?.clips?.find((entry) => entry.id === clipId);
  if (!track || !clip) throw new Error("CREATIVE_MUSIC_ELASTIC_CLIP_NOT_FOUND");
  return { track, clip };
}

function assertRevision(session, expectedRevision) {
  const current = Math.max(0, Math.round(finite(session.revision, 0)));
  const expected = Math.max(0, Math.round(finite(expectedRevision, -1)));
  if (current !== expected) { const error = new Error(`CREATIVE_MUSIC_ELASTIC_REVISION_CONFLICT:expected=${expected}:current=${current}`); error.status = 409; throw error; }
  return current;
}

async function persist(project, session) {
  const next = normalizedSession(session);
  await CreativeProjectRepository.update(project.id, {
    metadata: { ...(project.metadata || {}), [METADATA_KEY]: next, music_multitrack_updated_at: new Date().toISOString() },
  });
  return next;
}

function assetProjectId(asset) { return text(asset?.creative_project_id || asset?.metadata?.creative_project_id); }

async function sourceAssetInScope(organizationId, projectId, assetId) {
  const asset = await CreativeAssetsRuntime.get(assetId);
  if (!asset || String(asset.organization_id) !== String(organizationId) || assetProjectId(asset) !== String(projectId)) {
    throw new Error("CREATIVE_MUSIC_ELASTIC_SOURCE_ASSET_NOT_FOUND");
  }
  return asset;
}

async function sourceRightsConfirmed(asset, organizationId, projectId, seen = new Set()) {
  if (!asset?.id || seen.has(asset.id) || seen.size >= 8) return false;
  seen.add(asset.id);
  const metadata = object(asset.metadata);
  if (metadata.source_rights_confirmed === true || metadata.source_is_user_recording === true) return true;
  const parentId = text(metadata.source_asset_id || metadata.original_source_asset_id || metadata.elastic_source_asset_id || metadata.correction_source_asset_id);
  if (!parentId) return false;
  try {
    return sourceRightsConfirmed(await sourceAssetInScope(organizationId, projectId, parentId), organizationId, projectId, seen);
  } catch {
    return false;
  }
}

function currentPlan(clip) {
  const elastic = object(clip?.elastic_audio);
  const plan = object(elastic.warp_plan);
  if (plan.contract !== PLAN_CONTRACT) throw new Error("CREATIVE_MUSIC_ELASTIC_WARP_PLAN_MISSING");
  if (text(elastic.source_asset_id) !== text(clip.source_asset_id) || text(plan.source_asset_id) !== text(clip.source_asset_id)) {
    throw new Error("CREATIVE_MUSIC_ELASTIC_WARP_PLAN_STALE_SOURCE");
  }
  if (Math.abs(finite(elastic.source_offset_seconds, -1) - finite(clip.source_offset_seconds, 0)) > 0.001) throw new Error("CREATIVE_MUSIC_ELASTIC_WARP_PLAN_STALE_OFFSET");
  if (Math.abs(finite(elastic.source_duration_seconds, -1) - finite(clip.duration_seconds, 0)) > 0.01) throw new Error("CREATIVE_MUSIC_ELASTIC_WARP_PLAN_STALE_DURATION");
  if (plan.automatic_apply_forbidden !== true || plan.pitch_preserving_render_required !== true || plan.transient_preservation_required !== true) {
    throw new Error("CREATIVE_MUSIC_ELASTIC_WARP_PLAN_GOVERNANCE_INVALID");
  }
  if (plan.render_ready !== true || plan.all_reviewed !== true) throw new Error("CREATIVE_MUSIC_ELASTIC_WARP_PLAN_REVIEW_INCOMPLETE");
  const unapproved = (plan.markers || []).filter((marker) => marker.eligible === true && Math.abs(finite(marker.proposed_shift_ms, 0)) >= 2 && marker.approved !== true);
  if (unapproved.length) throw new Error("CREATIVE_MUSIC_ELASTIC_WARP_MARKERS_UNAPPROVED");
  return plan;
}

function readinessBase() {
  const engineEnabled = enabled(process.env.AVANTIQO_MUSIC_ELASTIC_ENGINE_ENABLED);
  const engineCertified = enabled(process.env.AVANTIQO_MUSIC_ELASTIC_ENGINE_CERTIFIED);
  return {
    ready: false,
    engine_enabled: engineEnabled,
    engine_certified: engineCertified,
    engine_contract: ENGINE_CONTRACT,
    stretch_engine: "signalsmith-stretch",
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
      ? "AVANTIQO_MUSIC_ELASTIC_ENGINE_DISABLED"
      : !engineCertified
        ? "AVANTIQO_MUSIC_ELASTIC_ENGINE_NOT_CERTIFIED"
        : null,
    blocker_detail: null,
    explicit_marker_review_required: true,
    automatic_apply_forbidden: true,
  };
}

async function readiness({ organizationId, currency = "THB" } = {}) {
  const state = readinessBase();
  if (state.blocker) return state;
  if (!organizationId) return { ...state, blocker: "AVANTIQO_MUSIC_ELASTIC_ORGANIZATION_REQUIRED" };
  let organizationService;
  try {
    organizationService = await OrganizationServiceRuntime.get({ organization_id: organizationId, service_id: CAPABILITY });
  } catch (error) {
    return { ...state, blocker: "AVANTIQO_MUSIC_ELASTIC_SERVICE_LOOKUP_FAILED", blocker_detail: text(error?.message) || null };
  }
  if (!organizationService) return { ...state, blocker: "AVANTIQO_MUSIC_ELASTIC_SERVICE_NOT_ENABLED" };
  const serviceActive = text(organizationService.status).toUpperCase() === "ACTIVE";
  const usageEnabled = organizationService.usage_enabled !== false;
  const serviceState = { ...state, organization_service_enabled: true, organization_service_active: serviceActive, organization_usage_enabled: usageEnabled };
  if (!serviceActive) return { ...serviceState, blocker: "AVANTIQO_MUSIC_ELASTIC_SERVICE_NOT_ACTIVE" };
  if (!usageEnabled) return { ...serviceState, blocker: "AVANTIQO_MUSIC_ELASTIC_SERVICE_USAGE_DISABLED" };
  const ownedProvider = state.owned_provider_required;
  if (!ownedProvider) return { ...serviceState, blocker: "AVANTIQO_MUSIC_ELASTIC_OWNED_PROVIDER_POLICY_MISSING" };
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
    return { ...serviceState, blocker: "AVANTIQO_MUSIC_ELASTIC_PRODUCTION_PRICING_OR_PROVIDER_NOT_READY", blocker_detail: text(error?.message) || null };
  }
  if (text(selected?.provider) !== ownedProvider) {
    return { ...serviceState, owned_provider_selected: text(selected?.provider) || null, blocker: "AVANTIQO_MUSIC_ELASTIC_OWNED_PROVIDER_NOT_SELECTED" };
  }
  return {
    ...serviceState,
    ready: Boolean(selected.pricing_id && selected.pricing_record),
    owned_provider_selected: selected.provider,
    production_pricing_ready: Boolean(selected.pricing_id && selected.pricing_record),
    pricing_id: selected.pricing_id || null,
    model: selected.model || null,
    currency: selected.currency || text(currency || "THB") || "THB",
    blocker: selected.pricing_id && selected.pricing_record ? null : "AVANTIQO_MUSIC_ELASTIC_PRODUCTION_PRICING_REQUIRED",
    blocker_detail: null,
  };
}

function pendingRequestFromExecution({ execution, planFingerprint, clip, revision }) {
  const providerResult = object(execution.output);
  const providerOutput = object(providerResult.output);
  return {
    contract: RENDER_REQUEST_CONTRACT,
    id: randomUUID(),
    status: execution.pending === true ? "PENDING" : execution.failed === true ? "FAILED" : "COMPLETED_PENDING_APPLY",
    submitted_at: new Date().toISOString(),
    source_project_revision: revision,
    source_asset_id: clip.source_asset_id,
    source_offset_seconds: finite(clip.source_offset_seconds, 0),
    source_duration_seconds: finite(clip.duration_seconds, 0),
    warp_plan_fingerprint: planFingerprint,
    usage_id: execution.usage?.id || null,
    provider: execution.provider || null,
    provider_job_id: execution.provider_job_id || null,
    provider_status: execution.provider_status || null,
    pricing: execution.pricing || null,
    quantity: execution.usage?.quantity ?? clip.duration_seconds,
    unit: execution.usage?.unit || null,
    credential_id: execution.credential_id || null,
    started_at: execution.started_at || new Date().toISOString(),
    output_storage_reference: text(providerOutput.output_storage_reference) || null,
    engine_contract: ENGINE_CONTRACT,
    execution_mode: "MUSICIAN_APPROVED_WARP_PLAN",
    automatic_apply_forbidden: true,
  };
}

async function persistRenderRequest(project, session, trackId, clipId, renderRequest) {
  const next = structuredClone(session);
  const target = selectClip(next, trackId, clipId).clip;
  target.elastic_audio = { ...(target.elastic_audio || {}), render_request: renderRequest };
  next.revision = Math.max(0, Math.round(finite(session.revision, 0))) + 1;
  return persist(project, next);
}

function settledProviderOutput(settled) {
  const raw = object(settled?.output?.raw);
  const providerOutput = object(raw.output);
  const elasticRender = object(providerOutput.elastic_render);
  return {
    storageReference: text(elasticRender.storage_reference),
    report: providerOutput,
  };
}

async function existingDerivedAsset(organizationId, projectId, usageId) {
  const assets = await CreativeAssetsRuntime.list({ organization_id: organizationId, creative_project_id: projectId, limit: 1000 });
  return assets.find((asset) => text(asset.metadata?.music_asset_kind) === "ELASTIC_AUDIO_RENDER" && text(asset.metadata?.service_usage_id) === text(usageId)) || null;
}

async function persistCompletedAsset({ organizationId, projectId, project, sourceAsset, request, settled, output }) {
  const existing = await existingDerivedAsset(organizationId, projectId, request.usage_id);
  if (existing) return existing;
  if (!output.storageReference.startsWith("storage://creative-assets/")) throw new Error("CREATIVE_MUSIC_ELASTIC_RENDER_OUTPUT_REFERENCE_INVALID");
  const report = output.report;
  if (text(report.contract) !== RENDER_REPORT_CONTRACT) throw new Error("CREATIVE_MUSIC_ELASTIC_RENDER_REPORT_CONTRACT_INVALID");
  return CreativeAssetsRuntime.create({
    organization_id: organizationId,
    creative_project_id: projectId,
    creative_mission_id: project.creative_mission_id || null,
    asset_type: "AUDIO",
    file_url: output.storageReference,
    file_name: `elastic-audio-${request.id}.wav`,
    name: `${sourceAsset.name || sourceAsset.title || "Audio"} — Elastic`,
    title: `${sourceAsset.title || sourceAsset.name || "Audio"} — Elastic`,
    description: "Musician-reviewed transient-aware pitch-preserving elastic-audio render from Avantiqo Music Workstation.",
    ai_generated: false,
    provider: settled.provider || "avantiqo-audio",
    engine: ENGINE_CONTRACT,
    prompt: null,
    metadata: {
      media_kind: "MUSIC",
      mime_type: "audio/wav",
      music_asset_kind: "ELASTIC_AUDIO_RENDER",
      elastic_audio_render_contract: RENDER_RESULT_CONTRACT,
      elastic_audio_report_contract: RENDER_REPORT_CONTRACT,
      engine_contract: ENGINE_CONTRACT,
      stretch_engine: text(report.stretch_engine) || "signalsmith-stretch",
      source_asset_id: request.source_asset_id,
      original_source_asset_id: request.source_asset_id,
      source_offset_seconds: request.source_offset_seconds,
      source_duration_seconds: request.source_duration_seconds,
      warp_plan_fingerprint: request.warp_plan_fingerprint,
      service_usage_id: request.usage_id,
      provider_job_id: request.provider_job_id,
      output_checksum: text(report.output_checksum) || null,
      approved_marker_count: Math.max(0, Math.round(finite(report.approved_marker_count, 0))),
      segment_count: Math.max(0, Math.round(finite(report.render?.segment_count, 0))),
      pitch_preserving_time_stretch: report.render?.pitch_preserving_time_stretch === true,
      boundary_smoothing_ms: finite(report.render?.boundary_smoothing_ms, null),
      sample_rate: finite(report.render?.sample_rate, 48000),
      channels: finite(report.render?.channels, 2),
      bit_depth: 24,
      duration_seconds: finite(report.render?.duration_seconds, request.source_duration_seconds),
      explicit_musician_apply_required: true,
      human_listening_review_required: true,
      production_certified: false,
      source_rights_confirmed: true,
      source_assets_preserved: true,
      derived_asset: true,
      destructive_edit: false,
      rendered_at: new Date().toISOString(),
    },
    tags: ["music", "elastic-audio", "warp", "transient", "signalsmith", "derived", "24-bit", "musician-reviewed"],
  });
}

async function markRenderCompleted({ organizationId, projectId, trackId, clipId, request, derivedAsset, report }) {
  const project = await projectInScope(organizationId, projectId);
  const session = normalizedSession(project.metadata?.[METADATA_KEY]);
  const { clip } = selectClip(session, trackId, clipId);
  const elastic = object(clip.elastic_audio);
  const currentRequest = object(elastic.render_request);
  if (currentRequest.id === request.id && currentRequest.status === "COMPLETED_PENDING_APPLY" && currentRequest.derived_asset_id === derivedAsset.id) return session;
  if (text(clip.source_asset_id) !== text(request.source_asset_id) || fingerprint(object(elastic.warp_plan)) !== request.warp_plan_fingerprint) return session;
  const next = structuredClone(session);
  const target = selectClip(next, trackId, clipId).clip;
  target.elastic_audio = {
    ...(target.elastic_audio || {}),
    render_asset_id: derivedAsset.id,
    render_completed: true,
    render_report: {
      contract: text(report.contract) || RENDER_REPORT_CONTRACT,
      stretch_engine: text(report.stretch_engine) || null,
      output_checksum: text(report.output_checksum) || null,
      approved_marker_count: Math.max(0, Math.round(finite(report.approved_marker_count, 0))),
      pitch_preserving_time_stretch: report.render?.pitch_preserving_time_stretch === true,
      human_listening_review_required: true,
      production_certified: false,
    },
    render_request: { ...request, status: "COMPLETED_PENDING_APPLY", derived_asset_id: derivedAsset.id, completed_at: new Date().toISOString() },
  };
  next.revision = Math.max(0, Math.round(finite(session.revision, 0))) + 1;
  await persist(project, next);
  return next;
}

async function finalizeSettlement({ organizationId, projectId, trackId, clipId, request, settled }) {
  if (settled.pending === true) return { success: true, pending: true, contract: RENDER_REQUEST_CONTRACT, request, provider_status: settled.provider_status || request.provider_status, explicit_apply_required: true, provider_job_submitted: true, endpoint_mutation_performed: false };
  if (settled.failed === true) return { success: false, pending: false, failed: true, request, error: settled.error || "Elastic audio render failed", explicit_apply_required: true, provider_job_submitted: true, endpoint_mutation_performed: false };
  const output = settledProviderOutput(settled);
  if (!output.storageReference) throw new Error("CREATIVE_MUSIC_ELASTIC_RENDER_OUTPUT_REQUIRED");
  const sourceAsset = await sourceAssetInScope(organizationId, projectId, request.source_asset_id);
  const currentProject = await projectInScope(organizationId, projectId);
  const derivedAsset = await persistCompletedAsset({ organizationId, projectId, project: currentProject, sourceAsset, request, settled, output });
  await markRenderCompleted({ organizationId, projectId, trackId, clipId, request, derivedAsset, report: output.report });
  return {
    success: true,
    pending: false,
    contract: RENDER_RESULT_CONTRACT,
    request_id: request.id,
    usage_id: request.usage_id,
    derived_asset_id: derivedAsset.id,
    applied_to_current_clip: false,
    explicit_apply_required: true,
    source_asset_preserved: true,
    pitch_preserving_time_stretch: output.report?.render?.pitch_preserving_time_stretch === true,
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
  const session = normalizedSession(project.metadata?.[METADATA_KEY]);
  const revision = assertRevision(session, body.expected_revision);
  const { clip } = selectClip(session, trackId, clipId);
  const plan = currentPlan(clip);
  const planFingerprint = fingerprint(plan);
  const gate = await readiness({ organizationId, currency });
  const existing = object(clip.elastic_audio?.render_request);
  if (existing.contract === RENDER_REQUEST_CONTRACT && existing.warp_plan_fingerprint === planFingerprint && existing.source_asset_id === clip.source_asset_id && ["PENDING", "COMPLETED_PENDING_APPLY"].includes(existing.status)) {
    return { success: true, pending: existing.status === "PENDING", idempotent_existing_request: true, request: existing, readiness: gate, explicit_apply_required: true, provider_job_submitted: Boolean(existing.provider_job_id), endpoint_mutation_performed: false };
  }
  if (!gate.ready) { const error = new Error(gate.blocker); error.status = 503; throw error; }
  const sourceAsset = await sourceAssetInScope(organizationId, projectId, clip.source_asset_id);
  if (!(await sourceRightsConfirmed(sourceAsset, organizationId, projectId))) throw new Error("CREATIVE_MUSIC_ELASTIC_SOURCE_RIGHTS_CONFIRMATION_REQUIRED");
  const checksum = text(sourceAsset.metadata?.sha256 || sourceAsset.metadata?.checksum_sha256);
  const execution = await executeService({
    organization_id: organizationId,
    bill_to_organization_id: organizationId,
    entity_id: text(body.entity_id) || null,
    service_id: CAPABILITY,
    capability: CAPABILITY,
    provider_id: gate.owned_provider_selected,
    input: {
      source_audio: sourceAsset.file_url,
      quantity: Math.max(0.001, finite(clip.duration_seconds, 1)),
      duration_seconds: Math.max(0.001, finite(clip.duration_seconds, 1)),
      currency,
      provider_parameters: {
        rights_attestation: { contract: RIGHTS_CONTRACT, confirmed: true, content_restriction_policy: CONTENT_POLICY },
        source_asset_id: sourceAsset.id,
        source_offset_seconds: finite(clip.source_offset_seconds, 0),
        duration_seconds: finite(clip.duration_seconds, 0),
        ...(checksum.length === 64 ? { source_file_checksum: checksum } : {}),
        approved_warp_plan: plan,
      },
    },
    metadata: {
      module: "CREATIVE",
      operation: "AVANTIQO_MUSIC_WORKSTATION_ELASTIC_AUDIO_RENDER",
      creative_project_id: projectId,
      track_id: trackId,
      clip_id: clipId,
      source_asset_id: sourceAsset.id,
      source_project_revision: revision,
      warp_plan_contract: PLAN_CONTRACT,
      warp_plan_fingerprint: planFingerprint,
      readiness_pricing_id: gate.pricing_id,
      readiness_model: gate.model,
      execution_mode: "MUSICIAN_APPROVED_WARP_PLAN",
      original_source_preserved: true,
      automatic_apply_forbidden: true,
    },
  });
  const renderRequest = pendingRequestFromExecution({ execution, planFingerprint, clip, revision });
  await persistRenderRequest(project, session, trackId, clipId, renderRequest);
  if (execution.pending === true) return { success: true, pending: true, contract: RENDER_REQUEST_CONTRACT, request: renderRequest, readiness: gate, explicit_apply_required: true, provider_job_submitted: true, endpoint_mutation_performed: false };
  return finalizeSettlement({ organizationId, projectId, trackId, clipId, request: renderRequest, settled: { ...execution, pending: false, failed: execution.failed === true } });
}

async function checkRender(body) {
  const organizationId = text(body.organization_id);
  const projectId = text(body.creative_project_id);
  const trackId = text(body.track_id);
  const clipId = text(body.clip_id);
  const project = await projectInScope(organizationId, projectId);
  const session = normalizedSession(project.metadata?.[METADATA_KEY]);
  const { clip } = selectClip(session, trackId, clipId);
  const request = object(clip.elastic_audio?.render_request);
  if (request.contract !== RENDER_REQUEST_CONTRACT || !request.usage_id || !request.provider_job_id) throw new Error("CREATIVE_MUSIC_ELASTIC_PENDING_REQUEST_NOT_FOUND");
  if (body.request_id && text(body.request_id) !== text(request.id)) throw new Error("CREATIVE_MUSIC_ELASTIC_REQUEST_ID_MISMATCH");
  if (request.status === "COMPLETED_PENDING_APPLY" && request.derived_asset_id) {
    return { success: true, pending: false, contract: RENDER_RESULT_CONTRACT, request_id: request.id, derived_asset_id: request.derived_asset_id, applied_to_current_clip: false, explicit_apply_required: true, source_asset_preserved: true, provider_job_submitted: true, endpoint_mutation_performed: false };
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
    provider_status_input: { output_storage_reference: request.output_storage_reference },
    metadata: {
      module: "CREATIVE",
      operation: "AVANTIQO_MUSIC_WORKSTATION_ELASTIC_AUDIO_RENDER_STATUS",
      creative_project_id: projectId,
      track_id: trackId,
      clip_id: clipId,
      warp_plan_fingerprint: request.warp_plan_fingerprint,
      automatic_apply_forbidden: true,
    },
  });
  return finalizeSettlement({ organizationId, projectId, trackId, clipId, request, settled });
}

async function applyRender(body) {
  const organizationId = text(body.organization_id);
  const projectId = text(body.creative_project_id);
  const trackId = text(body.track_id);
  const clipId = text(body.clip_id);
  const project = await projectInScope(organizationId, projectId);
  const session = normalizedSession(project.metadata?.[METADATA_KEY]);
  const revision = assertRevision(session, body.expected_revision);
  const { clip } = selectClip(session, trackId, clipId);
  const elastic = object(clip.elastic_audio);
  const request = object(elastic.render_request);
  const derivedAssetId = text(request.derived_asset_id || elastic.render_asset_id);
  if (request.contract !== RENDER_REQUEST_CONTRACT || request.status !== "COMPLETED_PENDING_APPLY" || !derivedAssetId) throw new Error("CREATIVE_MUSIC_ELASTIC_COMPLETED_RENDER_REQUIRED");
  if (text(clip.source_asset_id) !== text(request.source_asset_id)) throw new Error("CREATIVE_MUSIC_ELASTIC_APPLY_SOURCE_CHANGED");
  if (fingerprint(currentPlan(clip)) !== request.warp_plan_fingerprint) throw new Error("CREATIVE_MUSIC_ELASTIC_APPLY_PLAN_CHANGED");
  const derivedAsset = await CreativeAssetsRuntime.get(derivedAssetId);
  if (!derivedAsset || String(derivedAsset.organization_id) !== String(organizationId) || assetProjectId(derivedAsset) !== projectId || text(derivedAsset.metadata?.music_asset_kind) !== "ELASTIC_AUDIO_RENDER") {
    throw new Error("CREATIVE_MUSIC_ELASTIC_DERIVED_ASSET_NOT_FOUND");
  }
  const next = structuredClone(session);
  const target = selectClip(next, trackId, clipId).clip;
  const sourceSnapshot = {
    source_asset_id: request.source_asset_id,
    source_offset_seconds: request.source_offset_seconds,
    duration_seconds: request.source_duration_seconds,
    preserved: true,
    change_kind: "ELASTIC_AUDIO_RENDER",
    replaced_by_asset_id: derivedAsset.id,
    warp_plan_fingerprint: request.warp_plan_fingerprint,
    at: new Date().toISOString(),
  };
  target.source_asset_history = [...(Array.isArray(target.source_asset_history) ? target.source_asset_history : []), sourceSnapshot];
  target.source_asset_id = derivedAsset.id;
  target.source_offset_seconds = 0;
  target.duration_seconds = finite(derivedAsset.metadata?.duration_seconds, request.source_duration_seconds);
  target.warp_mode = "off";
  target.elastic_audio = {
    ...elastic,
    render_asset_id: derivedAsset.id,
    render_completed: true,
    render_request: { ...request, status: "APPLIED", derived_asset_id: derivedAsset.id, applied_at: new Date().toISOString() },
    applied: {
      contract: RENDER_RESULT_CONTRACT,
      derived_asset_id: derivedAsset.id,
      original_source_asset_id: request.source_asset_id,
      original_source_offset_seconds: request.source_offset_seconds,
      original_source_duration_seconds: request.source_duration_seconds,
      warp_plan_fingerprint: request.warp_plan_fingerprint,
      service_usage_id: request.usage_id,
      provider_job_id: request.provider_job_id,
      pitch_preserving_time_stretch: derivedAsset.metadata?.pitch_preserving_time_stretch === true,
      human_listening_review_status: "APPROVED_BY_EXPLICIT_MUSICIAN_APPLY",
      source_assets_preserved: true,
      destructive_edit: false,
      applied_at: new Date().toISOString(),
    },
  };
  target.preserve_source_asset = true;
  target.destructive_edit = false;
  next.revision = revision + 1;
  await persist(project, next);
  return { success: true, contract: RENDER_RESULT_CONTRACT, revision: next.revision, derived_asset_id: derivedAsset.id, applied_to_current_clip: true, source_asset_preserved: true, explicit_musician_apply: true, provider_job_submitted: false, endpoint_mutation_performed: false };
}

async function revertRender(body) {
  const organizationId = text(body.organization_id);
  const projectId = text(body.creative_project_id);
  const trackId = text(body.track_id);
  const clipId = text(body.clip_id);
  const project = await projectInScope(organizationId, projectId);
  const session = normalizedSession(project.metadata?.[METADATA_KEY]);
  const revision = assertRevision(session, body.expected_revision);
  const { clip } = selectClip(session, trackId, clipId);
  const elastic = object(clip.elastic_audio);
  const applied = object(elastic.applied);
  if (applied.contract !== RENDER_RESULT_CONTRACT || !applied.original_source_asset_id || !applied.derived_asset_id) throw new Error("CREATIVE_MUSIC_ELASTIC_APPLIED_RENDER_NOT_FOUND");
  if (text(clip.source_asset_id) !== text(applied.derived_asset_id)) throw new Error("CREATIVE_MUSIC_ELASTIC_REVERT_CURRENT_SOURCE_CHANGED");
  await sourceAssetInScope(organizationId, projectId, applied.original_source_asset_id);
  const next = structuredClone(session);
  const target = selectClip(next, trackId, clipId).clip;
  target.source_asset_history = [
    ...(Array.isArray(target.source_asset_history) ? target.source_asset_history : []),
    {
      source_asset_id: applied.derived_asset_id,
      source_offset_seconds: finite(target.source_offset_seconds, 0),
      duration_seconds: finite(target.duration_seconds, 0),
      preserved: true,
      change_kind: "ELASTIC_AUDIO_REVERT",
      restored_asset_id: applied.original_source_asset_id,
      at: new Date().toISOString(),
    },
  ];
  target.source_asset_id = applied.original_source_asset_id;
  target.source_offset_seconds = finite(applied.original_source_offset_seconds, 0);
  target.duration_seconds = finite(applied.original_source_duration_seconds, target.duration_seconds);
  target.warp_mode = "off";
  target.elastic_audio = { ...elastic, applied: { ...applied, status: "REVERTED", reverted_at: new Date().toISOString() }, render_request: { ...object(elastic.render_request), status: "REVERTED" } };
  target.preserve_source_asset = true;
  target.destructive_edit = false;
  next.revision = revision + 1;
  await persist(project, next);
  return { success: true, contract: "AVANTIQO_MUSIC_ELASTIC_AUDIO_REVERT_V1", revision: next.revision, restored_source_asset_id: applied.original_source_asset_id, rendered_asset_preserved: true, provider_job_submitted: false, endpoint_mutation_performed: false };
}

async function analyze(body) {
  const organizationId = text(body.organization_id);
  const projectId = text(body.creative_project_id);
  const trackId = text(body.track_id);
  const clipId = text(body.clip_id);
  const project = await projectInScope(organizationId, projectId);
  const session = normalizedSession(project.metadata?.[METADATA_KEY]);
  const revision = assertRevision(session, body.expected_revision);
  const { clip } = selectClip(session, trackId, clipId);
  const asset = await sourceAssetInScope(organizationId, projectId, clip.source_asset_id);
  const analysis = await analyzeMusicElasticAudio({
    organization_id: organizationId,
    source_url: asset.file_url,
    source_file_name: asset.file_name || `${asset.id}.wav`,
    source_mime_type: asset.metadata?.mime_type || null,
    source_asset_id: asset.id,
    source_offset_seconds: clip.source_offset_seconds,
    duration_seconds: clip.duration_seconds,
    sensitivity: body.sensitivity,
  });
  const plan = buildMusicElasticWarpPlan({ analysis, bpm: body.bpm || session.bpm, division: body.division || "1/16", strength: body.strength, max_shift_ms: body.max_shift_ms, grid_offset_seconds: body.grid_offset_seconds });
  const next = structuredClone(session);
  const target = selectClip(next, trackId, clipId).clip;
  target.elastic_audio = {
    analysis,
    warp_plan: plan,
    source_asset_id: clip.source_asset_id,
    source_offset_seconds: clip.source_offset_seconds,
    source_duration_seconds: clip.duration_seconds,
    render_asset_id: null,
    render_completed: false,
    render_request: null,
    applied: null,
    automatic_apply_forbidden: true,
  };
  next.revision = revision + 1;
  await persist(project, next);
  return { success: true, contract: "AVANTIQO_MUSIC_ELASTIC_AUDIO_API_V2", analysis, warp_plan: plan, revision: next.revision, render_performed: false, provider_job_submitted: false, endpoint_mutation_performed: false };
}

async function reviewMarker(body, reviewAll = false) {
  const organizationId = text(body.organization_id);
  const projectId = text(body.creative_project_id);
  const trackId = text(body.track_id);
  const clipId = text(body.clip_id);
  const project = await projectInScope(organizationId, projectId);
  const session = normalizedSession(project.metadata?.[METADATA_KEY]);
  const revision = assertRevision(session, body.expected_revision);
  const { clip } = selectClip(session, trackId, clipId);
  if (!clip.elastic_audio?.warp_plan) throw new Error("CREATIVE_MUSIC_ELASTIC_WARP_PLAN_MISSING");
  const next = structuredClone(session);
  const target = selectClip(next, trackId, clipId).clip;
  if (reviewAll) {
    let plan = target.elastic_audio.warp_plan;
    for (const marker of plan.markers || []) {
      if (marker.eligible !== true) continue;
      plan = reviewMusicElasticWarpMarker(plan, marker.id, { approved: body.approved !== false });
    }
    target.elastic_audio.warp_plan = plan;
  } else {
    target.elastic_audio.warp_plan = reviewMusicElasticWarpMarker(target.elastic_audio.warp_plan, text(body.marker_id), { approved: body.approved === true, target_seconds: body.target_seconds });
  }
  target.elastic_audio.render_request = null;
  target.elastic_audio.render_asset_id = null;
  target.elastic_audio.render_completed = false;
  next.revision = revision + 1;
  await persist(project, next);
  return { success: true, contract: reviewAll ? "AVANTIQO_MUSIC_ELASTIC_AUDIO_REVIEW_ALL_V1" : "AVANTIQO_MUSIC_ELASTIC_AUDIO_REVIEW_V1", warp_plan: target.elastic_audio.warp_plan, revision: next.revision, render_performed: false, provider_job_submitted: false, endpoint_mutation_performed: false };
}

async function clearPlan(body) {
  const organizationId = text(body.organization_id);
  const projectId = text(body.creative_project_id);
  const trackId = text(body.track_id);
  const clipId = text(body.clip_id);
  const project = await projectInScope(organizationId, projectId);
  const session = normalizedSession(project.metadata?.[METADATA_KEY]);
  const revision = assertRevision(session, body.expected_revision);
  const { clip } = selectClip(session, trackId, clipId);
  if (clip.elastic_audio?.applied?.contract === RENDER_RESULT_CONTRACT && text(clip.source_asset_id) === text(clip.elastic_audio.applied.derived_asset_id)) {
    throw new Error("CREATIVE_MUSIC_ELASTIC_CLEAR_REQUIRES_REVERT_FIRST");
  }
  const next = structuredClone(session);
  delete selectClip(next, trackId, clipId).clip.elastic_audio;
  next.revision = revision + 1;
  await persist(project, next);
  return { success: true, contract: "AVANTIQO_MUSIC_ELASTIC_AUDIO_CLEAR_V1", revision: next.revision, original_source_preserved: true, provider_job_submitted: false, endpoint_mutation_performed: false };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id);
    if (!organizationId) return NextResponse.json({ success: false, error: "organization_id required" }, { status: 400 });
    await requireAccess(request, organizationId);
    const action = text(body.action || "analyze").toLowerCase();
    const needsClip = action !== "readiness";
    if (needsClip && (!text(body.creative_project_id) || !text(body.track_id) || !text(body.clip_id))) {
      return NextResponse.json({ success: false, error: "creative_project_id, track_id and clip_id required" }, { status: 400 });
    }
    const result = action === "readiness"
      ? { success: true, contract: "AVANTIQO_MUSIC_ELASTIC_AUDIO_RENDER_READINESS_V1", readiness: await readiness({ organizationId, currency: text(body.currency || "THB") || "THB" }), provider_job_submitted: false, endpoint_mutation_performed: false }
      : action === "analyze" ? await analyze(body)
        : action === "review_marker" ? await reviewMarker(body, false)
          : action === "review_all" ? await reviewMarker(body, true)
            : action === "submit_render" ? await submitRender(body)
              : action === "render_status" ? await checkRender(body)
                : action === "apply_render" ? await applyRender(body)
                  : action === "revert_render" ? await revertRender(body)
                    : action === "clear" ? await clearPlan(body)
                      : null;
    if (!result) return NextResponse.json({ success: false, error: "CREATIVE_MUSIC_ELASTIC_ACTION_INVALID" }, { status: 400 });
    return NextResponse.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Music elastic audio failed", provider_job_submitted: false, endpoint_mutation_performed: false }, { status: errorStatus(error) });
  }
}
