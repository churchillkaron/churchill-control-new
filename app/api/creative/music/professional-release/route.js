export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import { loadMusicConversationState } from "@/lib/creative/music/runtime/CreativeMusicConversationStateRuntime.js";
import { continueMusicProfessionalProduction } from "@/lib/creative/music/runtime/CreativeMusicProfessionalContinuationRuntime.js";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const PERMISSIONS = Object.freeze(["creative.execute", "creative.production.run", "creative.*"]);
function text(value) { return String(value ?? "").trim(); }
function kind(asset = {}) { return text(asset.metadata?.music_asset_kind).toUpperCase(); }
function created(asset = {}) { return Date.parse(asset.created_at || asset.updated_at || 0) || 0; }

async function requireAccess(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request, requiredAnyPermission: PERMISSIONS });
  if (!access.success) { const error = new Error(access.error || "CREATIVE_MUSIC_PRO_RELEASE_ACCESS_FORBIDDEN"); error.status = access.status || 403; throw error; }
}

async function resolveProjectAssets(organizationId, projectId) {
  return CreativeAssetsRuntime.list({ organization_id: organizationId, creative_project_id: projectId, limit: 1000 });
}

async function resolveSource(organizationId, projectId, explicitId = null) {
  if (explicitId) {
    const asset = await CreativeAssetsRuntime.get(explicitId);
    if (asset && text(asset.organization_id) === organizationId && text(asset.creative_project_id) === projectId) return asset;
  }
  const state = await loadMusicConversationState({ organization_id: organizationId, creative_project_id: projectId });
  const persistedId = text(state.state?.professional_production_state?.source_asset_id || state.state?.professional_production?.source_asset_id);
  if (persistedId) {
    const asset = await CreativeAssetsRuntime.get(persistedId);
    if (asset && text(asset.organization_id) === organizationId && text(asset.creative_project_id) === projectId) return asset;
  }
  const assets = await resolveProjectAssets(organizationId, projectId);
  return assets.filter((asset) => kind(asset) === "SOURCE" || asset.metadata?.music_world_class_plan).sort((a, b) => created(b) - created(a))[0] || null;
}

async function latestMixAssetId(organizationId, projectId) {
  const assets = await resolveProjectAssets(organizationId, projectId);
  return text(assets.filter((asset) => kind(asset) === "MIX_RENDER").sort((a, b) => created(b) - created(a))[0]?.id) || null;
}

async function status(body) {
  const organizationId = text(body.organization_id), projectId = text(body.creative_project_id);
  const source = await resolveSource(organizationId, projectId, text(body.source_asset_id));
  if (!source) return { success: true, active: false, status: "NO_PROFESSIONAL_SOURCE", release_ready: false, publication_authorized: false };
  const result = await continueMusicProfessionalProduction({ organization_id: organizationId, creative_project_id: projectId, source_asset_id: source.id, authorized_stage: "" });
  return { success: true, active: true, source_asset_id: source.id, source_title: source.title || source.name || source.file_name || "Music production", ...result, publication_authorized: false };
}

async function continueStage(body) {
  const organizationId = text(body.organization_id), projectId = text(body.creative_project_id);
  const source = await resolveSource(organizationId, projectId, text(body.source_asset_id));
  if (!source) throw new Error("CREATIVE_MUSIC_PRO_RELEASE_SOURCE_REQUIRED");
  const stage = text(body.authorized_stage);
  const mixAssetId = text(body.mix_asset_id) || ((stage === "MIX_ENGINEERING" || stage === "PREMASTER_QC") ? await latestMixAssetId(organizationId, projectId) : null);
  return continueMusicProfessionalProduction({ ...body, organization_id: organizationId, creative_project_id: projectId, source_asset_id: source.id, authorized_stage: stage, mix_asset_id: mixAssetId || undefined });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id), projectId = text(body.creative_project_id);
    if (!organizationId || !projectId) return NextResponse.json({ success: false, error: "organization_id and creative_project_id required" }, { status: 400 });
    await requireAccess(request, organizationId);
    const action = text(body.action || "status").toLowerCase();
    const result = action === "status" ? await status(body) : action === "continue" ? await continueStage(body) : null;
    if (!result) return NextResponse.json({ success: false, error: "CREATIVE_MUSIC_PRO_RELEASE_ACTION_INVALID" }, { status: 400 });
    return NextResponse.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Professional Release failed", publication_authorized: false }, { status: error?.status || 400 });
  }
}
