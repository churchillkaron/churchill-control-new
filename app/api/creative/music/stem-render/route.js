export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { buildMusicReleaseRenderPlan } from "@/lib/creative/music/runtime/CreativeMusicReleaseRenderPlanRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const EXECUTION_PERMISSIONS = Object.freeze(["creative.execute", "creative.production.run", "creative.*"]);
const MUSIC_BUCKET = "creative-assets";
const MULTITRACK_METADATA_KEY = "music_multitrack_project";
const MAX_STEM_BYTES = 2_147_483_648;
const KINDS = new Set(["TRACK_STEM", "GROUP_STEM", "INSTRUMENTAL", "ACAPELLA"]);

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = null) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function sortedUnique(values = []) { return [...new Set(values.map(text).filter(Boolean))].sort(); }
function fingerprint(plan) { return createHash("sha256").update(JSON.stringify(plan)).digest("hex"); }

function safeWavName(value) {
  const original = text(value || "music-stem.wav");
  if (!/\.wav$/i.test(original)) throw new Error("CREATIVE_MUSIC_STEM_WAV_REQUIRED");
  const base = original.replace(/\.wav$/i, "").normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "music-stem";
  return `${base}.wav`;
}

async function requireAccess(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request, requiredAnyPermission: EXECUTION_PERMISSIONS });
  if (!access.success) {
    const error = new Error(access.error || "CREATIVE_MUSIC_STEM_ACCESS_FORBIDDEN");
    error.status = access.status || 403;
    throw error;
  }
}

async function projectInScope(organizationId, projectId) {
  if (!projectId) throw new Error("creative_project_id required");
  const project = await CreativeProjectRepository.getById(projectId);
  if (!project || String(project.organization_id) !== String(organizationId)) {
    const error = new Error("CREATIVE_MUSIC_STEM_PROJECT_NOT_FOUND");
    error.status = 404;
    throw error;
  }
  return project;
}

function currentSession(project) {
  const session = project?.metadata?.[MULTITRACK_METADATA_KEY];
  if (!session) throw new Error("CREATIVE_MUSIC_STEM_MULTITRACK_REQUIRED");
  return session;
}

function assertRevision(session, expectedRevision) {
  const current = Math.max(0, Math.round(finite(session.revision, 0)));
  const expected = Math.max(0, Math.round(finite(expectedRevision, -1)));
  if (current !== expected) {
    const error = new Error(`CREATIVE_MUSIC_STEM_REVISION_CONFLICT:expected=${expected}:current=${current}`);
    error.status = 409;
    throw error;
  }
  return current;
}

function outputPathToGroup(groupId, groupsById, targetId) {
  let current = text(groupId || "bus-master");
  const seen = new Set();
  while (current && current !== "bus-master") {
    if (current === targetId) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    current = text(groupsById.get(current)?.output_bus_id || "bus-master");
  }
  return false;
}

function expectedStem(plan, kindInput, targetIdInput) {
  const kind = text(kindInput).toUpperCase();
  const targetId = text(targetIdInput);
  if (!KINDS.has(kind)) throw new Error(`CREATIVE_MUSIC_STEM_KIND_INVALID:${kind}`);
  if (kind === "TRACK_STEM") {
    const track = plan.tracks.find((entry) => entry.id === targetId && entry.mute !== true);
    if (!track) throw new Error(`CREATIVE_MUSIC_STEM_TRACK_INVALID:${targetId}`);
    return {
      kind,
      target_id: targetId,
      label: track.name || "Track",
      source_asset_ids: sortedUnique(track.clips.map((clip) => clip.source_asset_id)),
      stage: "post-track-processing-pre-group",
      master_processing_applied: false,
      aux_returns_applied: false,
    };
  }
  if (kind === "GROUP_STEM") {
    const group = plan.groups.find((entry) => entry.id === targetId && entry.mute !== true);
    if (!group) throw new Error(`CREATIVE_MUSIC_STEM_GROUP_INVALID:${targetId}`);
    const groupsById = new Map(plan.groups.map((entry) => [entry.id, entry]));
    const tracks = plan.tracks.filter((track) => track.mute !== true && outputPathToGroup(track.output_bus_id, groupsById, targetId));
    if (!tracks.length) throw new Error(`CREATIVE_MUSIC_STEM_GROUP_EMPTY:${targetId}`);
    return {
      kind,
      target_id: targetId,
      label: group.name || "Group",
      source_asset_ids: sortedUnique(tracks.flatMap((track) => track.clips.map((clip) => clip.source_asset_id))),
      stage: "post-group-processing-pre-master",
      master_processing_applied: false,
      aux_returns_applied: false,
    };
  }
  const vocal = kind === "ACAPELLA";
  const tracks = plan.tracks.filter((track) => track.mute !== true && (vocal ? track.type === "vocal" : track.type !== "vocal"));
  if (!tracks.length) throw new Error(`CREATIVE_MUSIC_STEM_VARIANT_EMPTY:${kind}`);
  return {
    kind,
    target_id: kind.toLowerCase(),
    label: vocal ? "Acapella" : "Instrumental",
    source_asset_ids: sortedUnique(tracks.flatMap((track) => track.clips.map((clip) => clip.source_asset_id))),
    stage: "post-master-processing-pre-release-limiter",
    master_processing_applied: true,
    aux_returns_applied: true,
  };
}

async function prepareUpload(body) {
  const organizationId = text(body.organization_id);
  const projectId = text(body.creative_project_id);
  const project = await projectInScope(organizationId, projectId);
  const session = currentSession(project);
  const revision = assertRevision(session, body.expected_revision);
  const plan = buildMusicReleaseRenderPlan(session, body.options || body);
  if (!plan.readiness.release_render_ready) throw new Error(`CREATIVE_MUSIC_STEM_RENDER_BLOCKED:${plan.readiness.blockers.map((item) => item.code).join(",") || "NOT_READY"}`);
  const stem = expectedStem(plan, body.render_kind, body.target_id);
  const sizeBytes = finite(body.size_bytes, null);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_STEM_BYTES) throw new Error(`CREATIVE_MUSIC_STEM_SIZE_INVALID:max=${MAX_STEM_BYTES}`);
  const fileName = safeWavName(body.file_name);
  const planFingerprint = fingerprint(plan);
  const kindPath = stem.kind.toLowerCase().replace(/_/g, "-");
  const safeTarget = stem.target_id.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80);
  const path = `${organizationId}/derived/music-stem/${projectId}/r${revision}/${kindPath}/${safeTarget}/${planFingerprint.slice(0, 16)}-${randomUUID()}-${fileName}`;
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage.from(MUSIC_BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("CREATIVE_MUSIC_STEM_UPLOAD_URL_REQUIRED");
  return {
    success: true,
    contract: "AVANTIQO_MUSIC_STEM_UPLOAD_V1",
    upload_url: data.signedUrl,
    storage_reference: `storage://${MUSIC_BUCKET}/${path}`,
    project_revision: revision,
    render_plan_fingerprint: planFingerprint,
    stem,
    provider_job_submitted: false,
    endpoint_mutation_performed: false,
  };
}

async function registerStem(body) {
  const organizationId = text(body.organization_id);
  const projectId = text(body.creative_project_id);
  const project = await projectInScope(organizationId, projectId);
  const session = currentSession(project);
  const revision = assertRevision(session, body.expected_revision);
  const plan = buildMusicReleaseRenderPlan(session, body.options || body);
  if (!plan.readiness.release_render_ready) throw new Error("CREATIVE_MUSIC_STEM_CURRENT_PROJECT_NOT_READY");
  const planFingerprint = fingerprint(plan);
  if (text(body.render_plan_fingerprint) !== planFingerprint) throw new Error("CREATIVE_MUSIC_STEM_PLAN_FINGERPRINT_MISMATCH");
  const stem = expectedStem(plan, body.render_kind, body.target_id);
  const submittedSourceIds = sortedUnique(body.source_asset_ids || []);
  if (JSON.stringify(submittedSourceIds) !== JSON.stringify(stem.source_asset_ids)) throw new Error("CREATIVE_MUSIC_STEM_SOURCE_LINEAGE_MISMATCH");
  const storageReference = text(body.storage_reference);
  if (!storageReference.startsWith(`storage://${MUSIC_BUCKET}/${organizationId}/derived/music-stem/${projectId}/r${revision}/`)) throw new Error("CREATIVE_MUSIC_STEM_STORAGE_REFERENCE_INVALID");
  const sampleRate = finite(body.sample_rate, null);
  const channels = finite(body.channels, null);
  const duration = finite(body.render_duration_seconds, null);
  if (Math.round(sampleRate) !== Math.round(plan.sample_rate) || Math.round(channels) !== 2 || !Number.isFinite(duration) || duration <= 0) throw new Error("CREATIVE_MUSIC_STEM_FORMAT_INVALID");
  const levels = body.levels || {};
  if (!Number.isFinite(finite(levels.peak_dbfs, null)) || !Number.isFinite(finite(levels.rms_dbfs, null))) throw new Error("CREATIVE_MUSIC_STEM_LEVEL_EVIDENCE_REQUIRED");
  const fileName = safeWavName(body.file_name);
  const assetKind = stem.kind === "TRACK_STEM" ? "TRACK_STEM_RENDER" : stem.kind === "GROUP_STEM" ? "GROUP_STEM_RENDER" : stem.kind;
  const asset = await CreativeAssetsRuntime.create({
    organization_id: organizationId,
    creative_project_id: projectId,
    creative_mission_id: project.creative_mission_id || null,
    asset_type: "AUDIO",
    file_url: storageReference,
    file_name: fileName,
    name: text(body.title || `${plan.title} — ${stem.label}`),
    title: text(body.title || `${plan.title} — ${stem.label}`),
    description: `Non-destructive ${stem.label} render from Avantiqo Music Workstation.`,
    ai_generated: false,
    provider: "avantiqo-music-workstation",
    engine: "AVANTIQO_MUSIC_OFFLINE_AUDIO_RENDERER_V1",
    prompt: null,
    metadata: {
      media_kind: "MUSIC",
      mime_type: "audio/wav",
      music_asset_kind: assetKind,
      render_kind: stem.kind,
      target_id: stem.target_id,
      stem_stage: stem.stage,
      project_revision: revision,
      render_plan_fingerprint: planFingerprint,
      source_asset_ids: stem.source_asset_ids,
      source_assets_preserved: true,
      sample_rate: sampleRate,
      channels,
      bit_depth: 24,
      render_duration_seconds: duration,
      peak_dbfs: levels.peak_dbfs,
      rms_dbfs: levels.rms_dbfs,
      clipping: levels.clipping === true,
      headroom_db: finite(levels.headroom_db, null),
      master_processing_applied: stem.master_processing_applied,
      aux_returns_applied: stem.aux_returns_applied,
      release_limiter_applied: false,
      true_peak_certified: false,
      derived_asset: true,
      destructive_edit: false,
      rendered_at: new Date().toISOString(),
    },
    tags: ["music", "stem", stem.kind.toLowerCase(), "derived", "24-bit"],
  });
  return {
    success: true,
    contract: "AVANTIQO_MUSIC_STEM_ASSET_V1",
    asset_id: asset.id,
    storage_reference: asset.file_url,
    render_kind: stem.kind,
    target_id: stem.target_id,
    project_revision: revision,
    render_plan_fingerprint: planFingerprint,
    provider_job_submitted: false,
    endpoint_mutation_performed: false,
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id);
    if (!organizationId) return NextResponse.json({ success: false, error: "organization_id required" }, { status: 400 });
    await requireAccess(request, organizationId);
    const action = text(body.action || "prepare_upload").toLowerCase();
    const result = action === "prepare_upload" ? await prepareUpload(body) : action === "register" ? await registerStem(body) : null;
    if (!result) return NextResponse.json({ success: false, error: "CREATIVE_MUSIC_STEM_ACTION_INVALID" }, { status: 400 });
    return NextResponse.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Creative Music stem render failed" }, { status: error?.status || 400 });
  }
}
