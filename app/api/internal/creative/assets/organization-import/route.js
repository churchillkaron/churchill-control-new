export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import crypto from "node:crypto";
import path from "node:path";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ASSET_TABLE = "creative_assets";
const PROJECT_TABLE = "creative_projects";
const DEFAULT_BUCKET = "creative-assets";
const CONTRACT = "CREATIVE_ASSET_ORGANIZATION_IMPORT_V1";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function safeSegment(value, fallback = "asset") {
  return text(value)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 140) || fallback;
}

function extensionFrom(asset = {}, storagePath = "") {
  const candidate = text(asset.file_name || storagePath || asset.file_url);
  const ext = path.extname(candidate.split("?")[0].split("#")[0]).toLowerCase();
  return /^[.][a-z0-9]{1,8}$/.test(ext) ? ext : "";
}

function parseStorageReference(asset = {}) {
  const metadata = object(asset.metadata);
  const directPath = text(asset.storage_path || metadata.storage_path);
  const directBucket = text(metadata.storage_bucket || metadata.bucket_name);
  if (directPath) {
    return {
      bucket: directBucket || DEFAULT_BUCKET,
      storagePath: directPath,
    };
  }

  const url = text(asset.file_url || asset.image_url || asset.thumbnail_url);
  if (!url.startsWith("storage://")) return null;
  const rest = url.slice("storage://".length);
  const index = rest.indexOf("/");
  if (index <= 0 || index >= rest.length - 1) return null;
  return {
    bucket: rest.slice(0, index),
    storagePath: rest.slice(index + 1),
  };
}

async function projectById(id) {
  const { data, error } = await supabaseAdmin
    .from(PROJECT_TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function sourceAssets(project) {
  const selectedAssetIds = list(project.metadata?.selected_asset_ids)
    .map(text)
    .filter(Boolean);
  let query = supabaseAdmin
    .from(ASSET_TABLE)
    .select("*")
    .eq("organization_id", project.organization_id)
    .eq("creative_project_id", project.id)
    .neq("status", "archived");
  if (selectedAssetIds.length) {
    query = query.in("id", selectedAssetIds);
  }
  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function existingImport({ targetOrganizationId, targetProjectId, sourceAssetId }) {
  const { data, error } = await supabaseAdmin
    .from(ASSET_TABLE)
    .select("*")
    .eq("organization_id", targetOrganizationId)
    .eq("creative_project_id", targetProjectId)
    .eq("metadata->>organization_import_source_asset_id", sourceAssetId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function copyAsset({ source, sourceProject, targetProject }) {
  const existing = await existingImport({
    targetOrganizationId: targetProject.organization_id,
    targetProjectId: targetProject.id,
    sourceAssetId: source.id,
  });
  if (existing) {
    return { asset: existing, created: false, copied: false };
  }

  const sourceStorage = parseStorageReference(source);
  if (!sourceStorage) {
    throw new Error(`CREATIVE_ASSET_IMPORT_STORAGE_REFERENCE_REQUIRED:${source.id}`);
  }

  const { data: file, error: downloadError } = await supabaseAdmin.storage
    .from(sourceStorage.bucket)
    .download(sourceStorage.storagePath);
  if (downloadError || !file) {
    throw new Error(
      `CREATIVE_ASSET_IMPORT_DOWNLOAD_FAILED:${source.id}:${downloadError?.message || "empty file"}`,
    );
  }

  const ext = extensionFrom(source, sourceStorage.storagePath);
  const base = safeSegment(
    path.basename(text(source.file_name || sourceStorage.storagePath), ext) || source.id,
    source.id,
  );
  const destinationPath = [
    targetProject.organization_id,
    targetProject.id,
    "organization-imports",
    `${source.id}-${base}${ext}`,
  ].join("/");
  const destinationBucket = DEFAULT_BUCKET;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(destinationBucket)
    .upload(destinationPath, file, {
      contentType: text(source.mime_type) || undefined,
      upsert: true,
      cacheControl: "3600",
    });
  if (uploadError) {
    throw new Error(
      `CREATIVE_ASSET_IMPORT_UPLOAD_FAILED:${source.id}:${uploadError.message}`,
    );
  }

  const storageUrl = `storage://${destinationBucket}/${destinationPath}`;
  const sourceMetadata = object(source.metadata);
  const importedMetadata = {
    ...sourceMetadata,
    storage_bucket: destinationBucket,
    storage_path: destinationPath,
    organization_import_contract: CONTRACT,
    organization_import_source_organization_id: sourceProject.organization_id,
    organization_import_source_project_id: sourceProject.id,
    organization_import_source_asset_id: source.id,
    organization_import_source_storage_bucket: sourceStorage.bucket,
    organization_import_source_storage_path: sourceStorage.storagePath,
    organization_imported_at: new Date().toISOString(),
  };

  const row = {
    organization_id: targetProject.organization_id,
    creative_mission_id: targetProject.creative_mission_id || null,
    creative_project_id: targetProject.id,
    page_id: source.page_id || null,
    campaign_id: null,
    asset_type: source.asset_type || "creative",
    source_type: "organization_import",
    name: source.name || source.title || source.file_name || null,
    title: source.title || source.name || null,
    description: source.description || null,
    file_url: storageUrl,
    image_url: source.image_url ? storageUrl : null,
    thumbnail_url: null,
    file_name: source.file_name || path.basename(destinationPath),
    ai_suggested_type: source.ai_suggested_type || null,
    analysis: object(source.analysis),
    metadata: importedMetadata,
    tags: Array.isArray(source.tags) ? source.tags : [],
    score: Number(source.score || 0),
    ai_generated: source.ai_generated === true,
    provider: source.provider || null,
    status: "active",
    mime_type: source.mime_type || null,
    approval_state: source.approval_state || "approved",
    revision: Number(source.revision || 1),
  };

  const { data: asset, error: insertError } = await supabaseAdmin
    .from(ASSET_TABLE)
    .insert(row)
    .select("*")
    .single();
  if (insertError) throw insertError;

  return { asset, created: true, copied: true };
}

async function handle(request) {
  try {
    const url = new URL(request.url);
    const body = request.method === "POST"
      ? await request.json().catch(() => ({}))
      : {};
    const sourceProjectId = text(
      body.source_project_id || body.sourceProjectId ||
      url.searchParams.get("source_project_id") || url.searchParams.get("sourceProjectId"),
    );
    const targetProjectId = text(
      body.target_project_id || body.targetProjectId ||
      url.searchParams.get("target_project_id") || url.searchParams.get("targetProjectId"),
    );
    const token = text(
      body.token || url.searchParams.get("token"),
    );

    if (!sourceProjectId || !targetProjectId || !token) {
      return Response.json({
        success: false,
        error: "source_project_id, target_project_id and token required",
        contract: CONTRACT,
      }, { status: 400 });
    }

    const [sourceProject, targetProject] = await Promise.all([
      projectById(sourceProjectId),
      projectById(targetProjectId),
    ]);
    if (!sourceProject || !targetProject) {
      return Response.json({
        success: false,
        error: "CREATIVE_ASSET_IMPORT_PROJECT_NOT_FOUND",
        contract: CONTRACT,
      }, { status: 404 });
    }
    if (String(sourceProject.organization_id) === String(targetProject.organization_id)) {
      return Response.json({
        success: false,
        error: "CREATIVE_ASSET_IMPORT_CROSS_ORGANIZATION_REQUIRED",
        contract: CONTRACT,
      }, { status: 400 });
    }

    const targetMetadata = object(targetProject.metadata);
    const expectedHash = text(targetMetadata.asset_import_token_sha256);
    if (!expectedHash || sha256(token) !== expectedHash) {
      return Response.json({
        success: false,
        error: "CREATIVE_ASSET_IMPORT_UNAUTHORIZED",
        contract: CONTRACT,
      }, { status: 401 });
    }

    const assets = await sourceAssets(sourceProject);
    if (!assets.length) {
      return Response.json({
        success: false,
        error: "CREATIVE_ASSET_IMPORT_SOURCE_EMPTY",
        contract: CONTRACT,
      }, { status: 400 });
    }

    const results = [];
    for (const source of assets) {
      results.push(await copyAsset({ source, sourceProject, targetProject }));
    }

    const importedIds = results.map((item) => item.asset?.id).filter(Boolean);
    const selectedAssetIds = [...new Set([
      ...list(targetMetadata.selected_asset_ids).map(text),
      ...importedIds.map(text),
    ])];
    const nextMetadata = {
      ...targetMetadata,
      selected_asset_ids: selectedAssetIds,
      asset_import_contract: CONTRACT,
      asset_import_source_project_id: sourceProject.id,
      asset_import_source_organization_id: sourceProject.organization_id,
      asset_import_completed_at: new Date().toISOString(),
      asset_import_count: importedIds.length,
    };
    delete nextMetadata.asset_import_token_sha256;

    const { error: updateError } = await supabaseAdmin
      .from(PROJECT_TABLE)
      .update({
        metadata: nextMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetProject.id)
      .eq("organization_id", targetProject.organization_id);
    if (updateError) throw updateError;

    return Response.json({
      success: true,
      contract: CONTRACT,
      source_project_id: sourceProject.id,
      source_organization_id: sourceProject.organization_id,
      target_project_id: targetProject.id,
      target_organization_id: targetProject.organization_id,
      source_asset_count: assets.length,
      imported_asset_count: importedIds.length,
      copied_asset_count: results.filter((item) => item.copied).length,
      reused_asset_count: results.filter((item) => !item.created).length,
      selected_asset_count: selectedAssetIds.length,
      token_consumed: true,
    });
  } catch (error) {
    console.error("CREATIVE_ASSET_ORGANIZATION_IMPORT_FAILED", {
      message: error?.message || String(error),
      stack: error?.stack || null,
    });
    return Response.json({
      success: false,
      contract: CONTRACT,
      error: error?.message || String(error),
    }, { status: 500 });
  }
}

export async function GET(request) {
  return handle(request);
}

export async function POST(request) {
  return handle(request);
}
