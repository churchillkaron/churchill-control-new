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
import { resolveProvider } from "@/lib/platform/service-runtime/providers/ProviderResolver.js";
import { resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";

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


function localAcceptancePolicy() {
  return {
    execution_scope: "BENCHMARK_REVIEW_PREVIEW",
    benchmark_only: true,
    owned_only_required: true,
    external_fallback_allowed: false,
    studio_preproduction_review: true,
    preferred_providers: ["avantiqo-audio"],
    allowed_providers: ["avantiqo-audio"],
  };
}

function localAcceptanceAllowed() {
  return process.env.NODE_ENV !== "production" && ["1", "true", "yes", "on"].includes(text(process.env.AVANTIQO_MUSIC_LOCAL_NODE_LIVE_ACCEPTANCE_ENABLED).toLowerCase());
}

async function localStemAcceptanceReady(organizationId) {
  if (!localAcceptanceAllowed()) return false;
  try {
    const selected = await resolveProvider({ organization_id: organizationId, capability: "ai.audio.stems", preferredProvider: "avantiqo-audio", currency: "THB", policy: localAcceptancePolicy() });
    return selected?.provider?.id === "avantiqo-audio" && selected?.model === "demucs-htdemucs-ft" && selected?.pricing_record?.benchmark_review_preview_authorized === true;
  } catch { return false; }
}

function separatorOutput(result = {}) {
  const first = result?.output && typeof result.output === "object" ? result.output : {};
  return first.output && typeof first.output === "object" ? first.output : first;
}

async function exposeStemFiles(organizationId, result) {
  const output = separatorOutput(result);
  const refs = output.storage_references || output.storageReferences || {};
  const keys = ["vocals", "drums", "bass", "other"];
  const files = [];
  for (const key of keys) {
    const reference = refs[key] || output.assets?.[key]?.storage_reference || null;
    if (!reference) continue;
    files.push({ key, storage_reference: reference, url: await resolveCreativeProviderAssetUrl({ organization_id: organizationId, value: reference }) });
  }
  return files;
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
  const stemPlan = (await plan(body)).plan;
  const productionCertified = stemPlan.executable === true && stemPlan.certification === "CERTIFIED";
  const localAcceptance = !productionCertified && await localStemAcceptanceReady(organizationId);
  if (!productionCertified && !localAcceptance) {
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
    provider_policy: localAcceptance ? localAcceptancePolicy() : { preferred_providers: ["avantiqo-audio"], allowed_providers: ["avantiqo-audio"] }, category: "AI",
  });
  return { success: result?.failed !== true, pending: result?.pending === true, failed: result?.failed === true, usage_id: result?.usage?.id || null, provider_status: result?.provider_status || null, output: result?.output || null, files: result?.pending ? [] : await exposeStemFiles(organizationId, result), production_certified: productionCertified, local_acceptance: localAcceptance };
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
  return { success: result?.failed !== true, pending: result?.pending === true, failed: result?.failed === true, usage_id: usageId, provider_status: result?.provider_status || null, output: result?.output || null, files: result?.pending ? [] : await exposeStemFiles(organizationId, result), settlement: result?.settlement || null };
}

async function plan(body) {
  const stemPlan = buildMusicTransformationPlan("stems", {
    ...body,
    rights_attestation: {
      contract: MUSIC_SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT,
      confirmed: body.source_rights_confirmed === true || body.rights_attestation?.confirmed === true,
    },
  });
  const productionCertified = stemPlan.executable === true;
  const localAcceptance = !productionCertified && !stemPlan.separation?.vocal_role_request && await localStemAcceptanceReady(text(body.organization_id));
  return {
    success: true,
    plan: stemPlan,
    ready_for_execution: productionCertified || localAcceptance,
    production_certified: productionCertified,
    local_acceptance: localAcceptance,
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
        ? await plan(body)
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
