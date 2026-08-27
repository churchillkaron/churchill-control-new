export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import { resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { validateMusicAutomation } from "@/lib/creative/music/runtime/CreativeMusicAutomationRuntime";
import { validateMusicGroupProcessing } from "@/lib/creative/music/runtime/CreativeMusicBusProcessingRuntime";
import {
  ensureMusicEngineeringBuses,
  validateMusicMixerRouting,
} from "@/lib/creative/music/runtime/CreativeMusicMixerRoutingRuntime";
import { ensureMusicMidiProject, validateMusicMidiProject } from "@/lib/creative/music/runtime/CreativeMusicMidiRuntime";
import {
  createMusicMultitrackProject,
  validateMusicMultitrackProject,
} from "@/lib/creative/music/runtime/CreativeMusicMultitrackRuntime";
import { ensureMusicSamplerProject, validateMusicSamplerProject } from "@/lib/creative/music/runtime/CreativeMusicSamplerRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const EXECUTION_PERMISSIONS = Object.freeze([
  "creative.execute",
  "creative.production.run",
  "creative.*",
]);
const METADATA_KEY = "music_multitrack_project";
const SAMPLER_METADATA_KEY = "music_sampler_project";

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function requireAccess(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request, requiredAnyPermission: EXECUTION_PERMISSIONS });
  if (!access.success) {
    const error = new Error(access.error || "CREATIVE_MUSIC_MULTITRACK_ACCESS_FORBIDDEN");
    error.status = access.status || 403;
    throw error;
  }
}

async function projectInScope(organizationId, projectId) {
  if (!projectId) throw new Error("creative_project_id required");
  const project = await CreativeProjectRepository.getById(projectId);
  if (!project || String(project.organization_id) !== String(organizationId)) {
    const error = new Error("CREATIVE_MUSIC_MULTITRACK_PROJECT_NOT_FOUND");
    error.status = 404;
    throw error;
  }
  return project;
}

function defaultSession(project) {
  return createMusicMultitrackProject({
    id: `music-multitrack-${project.id}`,
    title: project.name || project.title || "Music Project",
    bpm: project.metadata?.music_bpm || 96,
    time_signature: project.metadata?.music_time_signature || "4/4",
    sample_rate: 48000,
  });
}

function normalizedSession(session) {
  const next = ensureMusicEngineeringBuses(session);
  next.midi = ensureMusicMidiProject(next.midi || {});
  validateMusicMultitrackProject(next);
  validateMusicMixerRouting(next);
  validateMusicGroupProcessing(next);
  validateMusicAutomation(next);
  validateMusicMidiProject(next.midi);
  return next;
}

function sessionAssetIds(session = {}) {
  return new Set((session.tracks || []).flatMap((track) => [
    ...(track.clips || []).map((clip) => text(clip.source_asset_id)),
    ...(track.takes || []).map((take) => text(take.source_asset_id)),
  ]).filter(Boolean));
}

function samplerAssetIds(sampler = {}) {
  return new Set((sampler.kits || []).flatMap((kit) => (kit.pads || []).flatMap((pad) => [
    text(pad.sample_asset_id),
    ...(pad.layers || []).map((layer) => text(layer.sample_asset_id)),
  ])).filter(Boolean));
}

async function resolveAssetUrls(organizationId, projectId, requiredIds) {
  if (!requiredIds.size) return {};
  const assets = await CreativeAssetsRuntime.list({
    organization_id: organizationId,
    creative_project_id: projectId,
    limit: Math.max(200, requiredIds.size * 2),
  });
  const urls = {};
  for (const asset of assets) {
    const assetId = text(asset?.id || asset?.asset_id);
    if (!requiredIds.has(assetId)) continue;
    const source = text(asset?.file_url || asset?.url);
    if (!source) continue;
    urls[assetId] = await resolveCreativeProviderAssetUrl({ organization_id: organizationId, value: source });
  }
  return urls;
}

async function publicSessionResult({ organizationId, projectId, project, session, persisted }) {
  const sampler = ensureMusicSamplerProject(project.metadata?.[SAMPLER_METADATA_KEY] || {});
  validateMusicSamplerProject(sampler);
  const [assetUrls, sampleUrls] = await Promise.all([
    resolveAssetUrls(organizationId, projectId, sessionAssetIds(session)),
    resolveAssetUrls(organizationId, projectId, samplerAssetIds(sampler)),
  ]);
  const midiTrackCount = session.midi?.tracks?.length || 0;
  const midiClipCount = (session.midi?.tracks || []).reduce((sum, track) => sum + (track.clips?.length || 0), 0);
  return {
    success: true,
    session,
    revision: Math.max(0, Math.round(finite(session.revision, 0))),
    persisted,
    asset_urls: assetUrls,
    sampler,
    sample_urls: sampleUrls,
    preview_transport_ready: true,
    unified_transport_ready: true,
    unified_transport_contract: "AVANTIQO_MUSIC_UNIFIED_WORKSTATION_TRANSPORT_V1",
    midi_timeline_ready: true,
    midi_track_count: midiTrackCount,
    midi_clip_count: midiClipCount,
    sampler_ready: true,
    sampler_velocity_layers_ready: sampler.velocity_layers_supported === true,
    sampler_round_robin_ready: sampler.round_robin_supported === true,
    mixer_aux_routing_ready: true,
    mixer_group_routing_ready: true,
    mixer_group_processing_ready: true,
    mixer_automation_ready: true,
    provider_job_submitted: false,
    endpoint_mutation_performed: false,
  };
}

async function loadSession(organizationId, projectId) {
  const project = await projectInScope(organizationId, projectId);
  const saved = project.metadata?.[METADATA_KEY] || null;
  const session = normalizedSession(saved || defaultSession(project));
  return publicSessionResult({ organizationId, projectId, project, session, persisted: Boolean(saved) });
}

async function saveSession(organizationId, projectId, submitted) {
  const project = await projectInScope(organizationId, projectId);
  const current = normalizedSession(project.metadata?.[METADATA_KEY] || defaultSession(project));
  const currentRevision = Math.max(0, Math.round(finite(current.revision, 0)));
  const expectedRevision = Math.max(0, Math.round(finite(submitted?.revision, 0)));
  if (expectedRevision !== currentRevision) {
    const error = new Error(`CREATIVE_MUSIC_MULTITRACK_REVISION_CONFLICT:expected=${expectedRevision}:current=${currentRevision}`);
    error.status = 409;
    throw error;
  }
  const next = normalizedSession({ ...submitted, revision: currentRevision + 1, non_destructive_editing: true, preserve_original_sources: true });
  const metadata = {
    ...(project.metadata || {}),
    [METADATA_KEY]: next,
    music_bpm: next.bpm,
    music_time_signature: next.time_signature,
    music_multitrack_updated_at: new Date().toISOString(),
  };
  await CreativeProjectRepository.update(project.id, { metadata });
  return publicSessionResult({ organizationId, projectId, project: { ...project, metadata }, session: next, persisted: true });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id);
    const projectId = text(body.creative_project_id);
    if (!organizationId) return NextResponse.json({ success: false, error: "organization_id required" }, { status: 400 });
    await requireAccess(request, organizationId);
    const action = text(body.action || "load").toLowerCase();
    const result = action === "load"
      ? await loadSession(organizationId, projectId)
      : action === "save"
        ? await saveSession(organizationId, projectId, body.session)
        : null;
    if (!result) return NextResponse.json({ success: false, error: "CREATIVE_MUSIC_MULTITRACK_ACTION_INVALID" }, { status: 400 });
    return NextResponse.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Creative Music multitrack failed" }, { status: error?.status || 400 });
  }
}
