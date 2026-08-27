export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import { resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import {
  assignMusicSamplerSample,
  createMusicSamplerKit,
  ensureMusicSamplerProject,
  updateMusicSamplerPad,
  validateMusicSamplerProject,
} from "@/lib/creative/music/runtime/CreativeMusicSamplerRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const EXECUTION_PERMISSIONS = Object.freeze(["creative.execute", "creative.production.run", "creative.*"]);
const METADATA_KEY = "music_sampler_project";
const BUCKET = "creative-assets";
const MAX_SAMPLE_BYTES = 100 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["wav", "flac", "mp3", "m4a", "aac", "ogg", "opus"]);

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }

function safeFileName(value) {
  const source = text(value || "sample.wav");
  const parts = source.split(".");
  const extension = text(parts.length > 1 ? parts.pop() : "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error("CREATIVE_MUSIC_SAMPLER_SAMPLE_EXTENSION_INVALID");
  const base = parts.join(".").normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "sample";
  return `${base}.${extension}`;
}

async function requireAccess(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request, requiredAnyPermission: EXECUTION_PERMISSIONS });
  if (!access.success) {
    const error = new Error(access.error || "CREATIVE_MUSIC_SAMPLER_ACCESS_FORBIDDEN");
    error.status = access.status || 403;
    throw error;
  }
}

async function projectInScope(organizationId, projectId) {
  if (!projectId) throw new Error("creative_project_id required");
  const project = await CreativeProjectRepository.getById(projectId);
  if (!project || String(project.organization_id) !== String(organizationId)) {
    const error = new Error("CREATIVE_MUSIC_SAMPLER_PROJECT_NOT_FOUND");
    error.status = 404;
    throw error;
  }
  return project;
}

function samplerFromProject(project) {
  const sampler = ensureMusicSamplerProject(project.metadata?.[METADATA_KEY] || {});
  validateMusicSamplerProject(sampler);
  return sampler;
}

async function sampleAssetUrls(organizationId, projectId, sampler) {
  const ids = new Set((sampler.kits || []).flatMap((kit) => (kit.pads || []).map((pad) => text(pad.sample_asset_id))).filter(Boolean));
  if (!ids.size) return {};
  const assets = await CreativeAssetsRuntime.list({ organization_id: organizationId, creative_project_id: projectId, limit: Math.max(200, ids.size * 2) });
  const urls = {};
  for (const asset of assets) {
    if (!ids.has(text(asset.id))) continue;
    const source = text(asset.file_url || asset.url);
    if (!source) continue;
    urls[asset.id] = await resolveCreativeProviderAssetUrl({ organization_id: organizationId, value: source });
  }
  return urls;
}

async function publicResult(organizationId, projectId, sampler, extra = {}) {
  return {
    success: true,
    contract: "AVANTIQO_MUSIC_SAMPLER_API_V1",
    sampler,
    sample_urls: await sampleAssetUrls(organizationId, projectId, sampler),
    provider_job_submitted: false,
    endpoint_mutation_performed: false,
    ...extra,
  };
}

async function persist(project, sampler) {
  validateMusicSamplerProject(sampler);
  await CreativeProjectRepository.update(project.id, {
    metadata: {
      ...(project.metadata || {}),
      [METADATA_KEY]: sampler,
      music_sampler_updated_at: new Date().toISOString(),
    },
  });
  return sampler;
}

async function prepareUpload(body) {
  const organizationId = text(body.organization_id);
  const fileName = safeFileName(body.file_name);
  const sizeBytes = finite(body.size_bytes, -1);
  const contentType = text(body.content_type).toLowerCase();
  if (sizeBytes <= 0 || sizeBytes > MAX_SAMPLE_BYTES) throw new Error(`CREATIVE_MUSIC_SAMPLER_SAMPLE_SIZE_INVALID:max=${MAX_SAMPLE_BYTES}`);
  if (contentType && !contentType.startsWith("audio/")) throw new Error("CREATIVE_MUSIC_SAMPLER_SAMPLE_CONTENT_TYPE_INVALID");
  const path = `${organizationId}/source/music-sampler/${randomUUID()}-${fileName}`;
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("CREATIVE_MUSIC_SAMPLER_UPLOAD_URL_REQUIRED");
  return {
    success: true,
    contract: "AVANTIQO_MUSIC_SAMPLER_SAMPLE_UPLOAD_V1",
    upload_url: data.signedUrl,
    storage_reference: `storage://${BUCKET}/${path}`,
    max_sample_bytes: MAX_SAMPLE_BYTES,
    accepted_extensions: [...ALLOWED_EXTENSIONS],
    provider_job_submitted: false,
    endpoint_mutation_performed: false,
  };
}

async function registerSample(body) {
  const organizationId = text(body.organization_id);
  const projectId = text(body.creative_project_id);
  const project = await projectInScope(organizationId, projectId);
  const storageReference = text(body.storage_reference);
  if (!storageReference.startsWith(`storage://${BUCKET}/${organizationId}/source/music-sampler/`)) throw new Error("CREATIVE_MUSIC_SAMPLER_STORAGE_REFERENCE_INVALID");
  const fileName = safeFileName(body.file_name);
  const asset = await CreativeAssetsRuntime.create({
    organization_id: organizationId,
    creative_project_id: projectId,
    creative_mission_id: text(body.creative_mission_id) || null,
    asset_type: "AUDIO",
    file_url: storageReference,
    file_name: fileName,
    name: text(body.title || fileName),
    title: text(body.title || fileName),
    description: "Original user-owned sample for Avantiqo Music Sampler.",
    ai_generated: false,
    provider: "avantiqo-music-sampler",
    engine: "AVANTIQO_MUSIC_SAMPLER_PROJECT_V1",
    metadata: {
      media_kind: "MUSIC",
      music_asset_kind: "SAMPLER_SOURCE",
      music_sampler_contract: "AVANTIQO_MUSIC_SAMPLER_PROJECT_V1",
      immutable_original_sample: true,
      source_rights_confirmed: body.source_rights_confirmed === true,
      source_is_user_upload: true,
      destructive_processing_allowed: false,
    },
    tags: ["music", "sampler", "original-sample"],
  });
  const sampler = samplerFromProject(project);
  if (!sampler.sample_asset_ids.includes(asset.id)) sampler.sample_asset_ids.push(asset.id);
  await persist(project, sampler);
  return {
    ...(await publicResult(organizationId, projectId, sampler)),
    asset: {
      id: asset.id,
      title: asset.title || asset.name || fileName,
      playback_url: await resolveCreativeProviderAssetUrl({ organization_id: organizationId, value: asset.file_url }),
    },
    original_sample_preserved: true,
  };
}

async function mutate(body) {
  const organizationId = text(body.organization_id);
  const projectId = text(body.creative_project_id);
  const project = await projectInScope(organizationId, projectId);
  const sampler = samplerFromProject(project);
  const action = text(body.action).toLowerCase();
  if (action === "add_kit") {
    const kit = createMusicSamplerKit(body.kit || {});
    sampler.kits.push(kit);
    sampler.selected_kit_id = kit.id;
  } else if (action === "select_kit") {
    const kitId = text(body.kit_id);
    if (!sampler.kits.some((kit) => kit.id === kitId)) throw new Error("CREATIVE_MUSIC_SAMPLER_KIT_NOT_FOUND");
    sampler.selected_kit_id = kitId;
  } else if (action === "update_pad" || action === "assign_sample") {
    const kitId = text(body.kit_id || sampler.selected_kit_id);
    const index = sampler.kits.findIndex((kit) => kit.id === kitId);
    if (index < 0) throw new Error("CREATIVE_MUSIC_SAMPLER_KIT_NOT_FOUND");
    if (action === "update_pad") {
      sampler.kits[index] = updateMusicSamplerPad(sampler.kits[index], body.midi_pitch, body.pad || {});
    } else {
      const asset = await CreativeAssetsRuntime.get(text(body.sample_asset_id));
      if (!asset || String(asset.organization_id) !== String(organizationId) || text(asset.creative_project_id || asset.metadata?.creative_project_id) !== String(projectId)) {
        throw new Error("CREATIVE_MUSIC_SAMPLER_SAMPLE_ASSET_NOT_FOUND");
      }
      sampler.kits[index] = assignMusicSamplerSample(sampler.kits[index], body.midi_pitch, asset);
      if (!sampler.sample_asset_ids.includes(asset.id)) sampler.sample_asset_ids.push(asset.id);
    }
  } else {
    throw new Error("CREATIVE_MUSIC_SAMPLER_ACTION_INVALID");
  }
  const saved = await persist(project, sampler);
  return publicResult(organizationId, projectId, saved, { action });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id);
    const projectId = text(body.creative_project_id);
    if (!organizationId) return NextResponse.json({ success: false, error: "organization_id required" }, { status: 400 });
    await requireAccess(request, organizationId);
    const action = text(body.action || "load").toLowerCase();
    const result = action === "prepare_upload"
      ? await prepareUpload(body)
      : action === "register_sample"
        ? await registerSample(body)
        : action === "load"
          ? await (async () => {
              const project = await projectInScope(organizationId, projectId);
              return publicResult(organizationId, projectId, samplerFromProject(project), { persisted: Boolean(project.metadata?.[METADATA_KEY]) });
            })()
          : await mutate({ ...body, action });
    return NextResponse.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Creative Music sampler failed", provider_job_submitted: false, endpoint_mutation_performed: false }, { status: error?.status || 400 });
  }
}
