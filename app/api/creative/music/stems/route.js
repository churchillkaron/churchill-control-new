export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import {
  buildMusicTransformationPlan,
  MUSIC_SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT,
} from "@/lib/creative/runtime/engines/MusicEngine";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { executeService, settlePendingService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { UsageRuntime } from "@/lib/platform/service-runtime/usage/UsageRuntime";

const EXECUTION_PERMISSIONS = Object.freeze([
  "creative.execute",
  "creative.production.run",
  "creative.*",
]);
const MUSIC_BUCKET = "creative-assets";
const MAX_SOURCE_BYTES = 629145600;
const AUDIO_EXTENSIONS = new Set(["wav", "mp3", "m4a", "aac", "flac", "ogg"]);

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
    const error = new Error(access.error || "CREATIVE_MUSIC_STEMS_ACCESS_FORBIDDEN");
    error.status = access.status || 403;
    throw error;
  }
}

function safeFileName(value) {
  const original = text(value || "source-audio");
  const pieces = original.split(".");
  const extension = text(pieces.length > 1 ? pieces.pop() : "").toLowerCase();
  if (!AUDIO_EXTENSIONS.has(extension)) throw new Error("CREATIVE_MUSIC_SOURCE_AUDIO_EXTENSION_INVALID");
  const base = pieces.join(".")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "source-audio";
  return `${base}.${extension}`;
}

async function prepareSourceUpload(body) {
  const organizationId = text(body.organization_id);
  const fileName = safeFileName(body.file_name);
  const sizeBytes = finite(body.size_bytes, null);
  const contentType = text(body.content_type).toLowerCase();
  if (sizeBytes === null || sizeBytes <= 0 || sizeBytes > MAX_SOURCE_BYTES) {
    throw new Error(`CREATIVE_MUSIC_SOURCE_AUDIO_SIZE_INVALID:max=${MAX_SOURCE_BYTES}`);
  }
  if (contentType && !contentType.startsWith("audio/")) {
    throw new Error("CREATIVE_MUSIC_SOURCE_AUDIO_CONTENT_TYPE_INVALID");
  }
  const path = `${organizationId}/source/music-stems/${randomUUID()}-${fileName}`;
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage
    .from(MUSIC_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("CREATIVE_MUSIC_SOURCE_UPLOAD_URL_REQUIRED");
  return {
    success: true,
    upload_url: data.signedUrl,
    storage_reference: `storage://${MUSIC_BUCKET}/${path}`,
    max_source_bytes: MAX_SOURCE_BYTES,
    max_source_duration_seconds: 900,
    accepted_extensions: [...AUDIO_EXTENSIONS],
  };
}

async function executeStems(body) {
  const organizationId = text(body.organization_id);
  const stemPlan = plan(body).plan;
  if (stemPlan.executable !== true || stemPlan.certification !== "CERTIFIED") {
    const error = new Error(`CREATIVE_MUSIC_STEMS_NOT_CERTIFIED:${stemPlan.certification || "NOT_READY"}`);
    error.status = 503;
    throw error;
  }
  const duration = finite(body.source_duration_seconds ?? body.duration_seconds, null);
  if (!duration || duration <= 0) throw new Error("CREATIVE_MUSIC_SOURCE_DURATION_REQUIRED");
  const result = await executeService({
    organization_id: organizationId, bill_to_organization_id: organizationId,
    entity_id: text(body.entity_id) || null, service_id: stemPlan.service_id, capability: stemPlan.capability,
    input: {
      title: text(body.title || "Separated stems"), quantity: duration, currency: text(body.currency || "THB"),
      source_audio: stemPlan.source_audio, rights_attestation: stemPlan.rights_attestation,
      requirements: { output_spec: stemPlan.output_spec, rights_attestation: stemPlan.rights_attestation },
      output_spec: stemPlan.output_spec, provider_parameters: { ...(stemPlan.provider_parameters || {}), export_stems: true },
    },
    metadata: { module: "CREATIVE", operation: "AVANTIQO_MUSIC_STEMS_EXECUTE", creative_project_id: text(body.creative_project_id) || null, creative_mission_id: text(body.creative_mission_id) || null, source_rights_attested: true, provider_selection_exposed: false },
    provider_policy: { preferred_providers: ["avantiqo-audio"], allowed_providers: ["avantiqo-audio"] }, category: "AI",
  });
  return { success: result?.failed !== true, pending: result?.pending === true, failed: result?.failed === true, usage_id: result?.usage?.id || null, provider_status: result?.provider_status || null, output: result?.output || null, production_certified: true };
}

async function settleStems(body) {
  const organizationId = text(body.organization_id);
  const usageId = text(body.usage_id);
  if (!usageId) throw new Error("usage_id required");
  const usage = await UsageRuntime.get(usageId);
  if (!usage || text(usage.organization_id) !== organizationId || text(usage.capability) !== "ai.audio.stems") {
    const error = new Error("CREATIVE_MUSIC_STEMS_USAGE_NOT_FOUND"); error.status = 404; throw error;
  }
  const providerJobId = text(usage.provider_request_id || usage.metadata?.provider_request_id);
  if (!providerJobId) throw new Error("CREATIVE_MUSIC_STEMS_PROVIDER_JOB_REQUIRED");
  const result = await settlePendingService({ organization_id: organizationId, provider: text(usage.provider), provider_job_id: providerJobId, usage_id: usageId, pricing: {}, quantity: finite(usage.quantity, null), unit: text(usage.unit) || null, credential_id: null, started_at: text(usage.execution_started_at || usage.created_at) || null, metadata: { module: "CREATIVE", operation: "AVANTIQO_MUSIC_STEMS_SETTLE" } });
  return { success: result?.failed !== true, pending: result?.pending === true, failed: result?.failed === true, usage_id: usageId, provider_status: result?.provider_status || null, output: result?.output || null, settlement: result?.settlement || null };
}

function plan(body) {
  const stemPlan = buildMusicTransformationPlan("stems", {
    ...body,
    rights_attestation: {
      contract: MUSIC_SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT,
      confirmed: body.source_rights_confirmed === true || body.rights_attestation?.confirmed === true,
    },
  });
  return {
    success: true,
    plan: stemPlan,
    ready_for_execution: stemPlan.executable === true,
    production_certified: stemPlan.executable === true,
    rights_confirmation_required: true,
  };
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
        ? plan(body)
        : action === "execute"
          ? await executeStems(body)
          : action === "status"
            ? await settleStems(body)
            : null;
    if (!result) {
      return NextResponse.json({ success: false, error: "CREATIVE_MUSIC_STEMS_ACTION_INVALID" }, { status: 400 });
    }
    return NextResponse.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Creative Music Stems failed" },
      { status: error?.status || 400 },
    );
  }
}
