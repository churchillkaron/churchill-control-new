export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import {
  createMusicMultitrackProject,
  validateMusicMultitrackProject,
} from "@/lib/creative/music/runtime/CreativeMusicMultitrackRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const EXECUTION_PERMISSIONS = Object.freeze([
  "creative.execute",
  "creative.production.run",
  "creative.*",
]);
const METADATA_KEY = "music_multitrack_project";

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function requireAccess(request, organizationId) {
  const access = await requireOrganizationAccess({
    organizationId,
    request,
    requiredAnyPermission: EXECUTION_PERMISSIONS,
  });
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

async function loadSession(organizationId, projectId) {
  const project = await projectInScope(organizationId, projectId);
  const saved = project.metadata?.[METADATA_KEY] || null;
  const session = saved || defaultSession(project);
  validateMusicMultitrackProject(session);
  return {
    success: true,
    session,
    revision: Math.max(0, Math.round(finite(session.revision, 0))),
    persisted: Boolean(saved),
    provider_job_submitted: false,
    endpoint_mutation_performed: false,
  };
}

async function saveSession(organizationId, projectId, submitted) {
  const project = await projectInScope(organizationId, projectId);
  const current = project.metadata?.[METADATA_KEY] || defaultSession(project);
  const currentRevision = Math.max(0, Math.round(finite(current.revision, 0)));
  const expectedRevision = Math.max(0, Math.round(finite(submitted?.revision, 0)));
  if (expectedRevision !== currentRevision) {
    const error = new Error(`CREATIVE_MUSIC_MULTITRACK_REVISION_CONFLICT:expected=${expectedRevision}:current=${currentRevision}`);
    error.status = 409;
    throw error;
  }
  const next = {
    ...submitted,
    revision: currentRevision + 1,
    non_destructive_editing: true,
    preserve_original_sources: true,
  };
  validateMusicMultitrackProject(next);
  const metadata = {
    ...(project.metadata || {}),
    [METADATA_KEY]: next,
    music_bpm: next.bpm,
    music_time_signature: next.time_signature,
    music_multitrack_updated_at: new Date().toISOString(),
  };
  await CreativeProjectRepository.update(project.id, { metadata });
  return {
    success: true,
    session: next,
    revision: next.revision,
    persisted: true,
    provider_job_submitted: false,
    endpoint_mutation_performed: false,
  };
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
    return NextResponse.json(
      { success: false, error: error?.message || "Creative Music multitrack failed" },
      { status: error?.status || 400 },
    );
  }
}
