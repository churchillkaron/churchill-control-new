export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { CreativeMusicAutoStudioRuntime } from "@/lib/creative/music/runtime/CreativeMusicAutoStudioRuntime";
import { executeMusicAutoStudioLocal } from "@/lib/creative/music/runtime/CreativeMusicAutoStudioExecutionRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const EXECUTION_PERMISSIONS = Object.freeze([
  "creative.execute",
  "creative.production.run",
  "creative.*",
]);
const MUSIC_BUCKET = "creative-assets";
const MAX_SOURCE_BYTES = 1_073_741_824;
const ALLOWED_EXTENSIONS = new Set([
  "wav", "mp3", "m4a", "aac", "flac", "ogg", "opus",
  "mp4", "mov", "m4v", "webm", "mkv",
]);

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
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
    const error = new Error(access.error || "CREATIVE_MUSIC_AUTO_STUDIO_ACCESS_FORBIDDEN");
    error.status = access.status || 403;
    throw error;
  }
}

function safeFileName(value) {
  const original = text(value || "studio-source");
  const pieces = original.split(".");
  const extension = text(pieces.length > 1 ? pieces.pop() : "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error("CREATIVE_MUSIC_AUTO_STUDIO_SOURCE_EXTENSION_INVALID");
  }
  const base = pieces.join(".")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "studio-source";
  return `${base}.${extension}`;
}

async function prepareSourceUpload(body) {
  const organizationId = text(body.organization_id);
  const fileName = safeFileName(body.file_name);
  const sizeBytes = finite(body.size_bytes, null);
  const contentType = text(body.content_type).toLowerCase();
  if (sizeBytes === null || sizeBytes <= 0 || sizeBytes > MAX_SOURCE_BYTES) {
    throw new Error(`CREATIVE_MUSIC_AUTO_STUDIO_SOURCE_SIZE_INVALID:max=${MAX_SOURCE_BYTES}`);
  }
  if (contentType && !contentType.startsWith("audio/") && !contentType.startsWith("video/")) {
    throw new Error("CREATIVE_MUSIC_AUTO_STUDIO_SOURCE_CONTENT_TYPE_INVALID");
  }
  const path = `${organizationId}/source/music-auto-studio/${randomUUID()}-${fileName}`;
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage
    .from(MUSIC_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("CREATIVE_MUSIC_AUTO_STUDIO_UPLOAD_URL_REQUIRED");
  return {
    success: true,
    upload_url: data.signedUrl,
    storage_reference: `storage://${MUSIC_BUCKET}/${path}`,
    max_source_bytes: MAX_SOURCE_BYTES,
    max_source_duration_seconds: 900,
    accepted_extensions: [...ALLOWED_EXTENSIONS],
    provider_job_submitted: false,
    endpoint_mutation_performed: false,
  };
}

function buildPlan(body) {
  const plan = CreativeMusicAutoStudioRuntime.plan({
    ...body,
    source_media: body.source_media || body.source_audio || body.audio,
    source_rights_confirmed: body.source_rights_confirmed === true,
  });
  return {
    success: true,
    plan,
    ready_for_local_finishing: plan.readiness.local_analyze_mix_master_ready === true,
    ready_for_full_auto_studio: plan.readiness.full_auto_studio_ready === true,
    provider_job_submitted: false,
    endpoint_mutation_performed: false,
  };
}

async function executeLocal(body) {
  return executeMusicAutoStudioLocal({
    ...body,
    source_media: body.source_media || body.source_audio || body.audio,
    source_rights_confirmed: body.source_rights_confirmed === true,
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id);
    if (!organizationId) {
      return NextResponse.json({ success: false, error: "organization_id required" }, { status: 400 });
    }
    await requireAccess(request, organizationId);
    const action = text(body.action || "plan").toLowerCase();
    const result = action === "prepare_source_upload"
      ? await prepareSourceUpload(body)
      : action === "plan"
        ? buildPlan(body)
        : action === "execute_local"
          ? await executeLocal(body)
          : null;
    if (!result) {
      return NextResponse.json({ success: false, error: "CREATIVE_MUSIC_AUTO_STUDIO_ACTION_INVALID" }, { status: 400 });
    }
    return NextResponse.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Creative Music Auto Studio failed" },
      { status: error?.status || 400 },
    );
  }
}
