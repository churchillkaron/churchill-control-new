export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import {
  buildMusicTransformationPlan,
  MUSIC_SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT,
} from "@/lib/creative/runtime/engines/MusicEngine";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { executeService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { buildMusicTemporalExtensionContract } from "@/lib/creative/music/runtime/CreativeMusicTemporalExtensionContractRuntime.js";

const EXECUTION_PERMISSIONS = Object.freeze([
  "creative.execute",
  "creative.production.run",
  "creative.*",
]);
const MUSIC_BUCKET = "creative-assets";
const MAX_SOURCE_BYTES = 629145600;
const AUDIO_EXTENSIONS = new Set(["wav", "mp3", "m4a", "aac", "flac", "ogg"]);
const OPERATIONS = new Set(["remix", "edit", "extend"]);
const TEMPORAL_EXTEND_STRATEGY = "XL_TURBO_REPAINT_RIGHT_OUTPAINT";

function text(value) {
  return String(value ?? "").trim();
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max, fallback) {
  const number = finite(value, fallback);
  return Math.max(min, Math.min(max, number));
}

function resolveOperation(value) {
  const key = text(value || "remix").toLowerCase();
  if (!OPERATIONS.has(key)) {
    const error = new Error(`CREATIVE_MUSIC_TRANSFORM_OPERATION_INVALID:${key || "MISSING"}`);
    error.code = "CREATIVE_MUSIC_TRANSFORM_OPERATION_INVALID";
    throw error;
  }
  return key;
}

async function requireAccess(request, organizationId) {
  const access = await requireOrganizationAccess({
    organizationId,
    request,
    requiredAnyPermission: EXECUTION_PERMISSIONS,
  });
  if (!access.success) {
    const error = new Error(access.error || "CREATIVE_MUSIC_TRANSFORM_ACCESS_FORBIDDEN");
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
  const operation = resolveOperation(body.operation);
  const fileName = safeFileName(body.file_name);
  const sizeBytes = finite(body.size_bytes, null);
  const contentType = text(body.content_type).toLowerCase();
  if (sizeBytes === null || sizeBytes <= 0 || sizeBytes > MAX_SOURCE_BYTES) {
    throw new Error(`CREATIVE_MUSIC_SOURCE_AUDIO_SIZE_INVALID:max=${MAX_SOURCE_BYTES}`);
  }
  if (contentType && !contentType.startsWith("audio/")) throw new Error("CREATIVE_MUSIC_SOURCE_AUDIO_CONTENT_TYPE_INVALID");
  const path = `${organizationId}/source/music-${operation}/${randomUUID()}-${fileName}`;
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage
    .from(MUSIC_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("CREATIVE_MUSIC_SOURCE_UPLOAD_URL_REQUIRED");
  return {
    success: true,
    operation,
    upload_url: data.signedUrl,
    storage_reference: `storage://${MUSIC_BUCKET}/${path}`,
    max_source_bytes: MAX_SOURCE_BYTES,
    max_source_duration_seconds: 900,
    accepted_extensions: [...AUDIO_EXTENSIONS],
  };
}

function rightsInput(body) {
  return {
    ...body,
    rights_attestation: {
      contract: MUSIC_SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT,
      confirmed: body.source_rights_confirmed === true || body.rights_attestation?.confirmed === true,
    },
  };
}

function buildTemporalExtendPlan(body) {
  const editPlan = buildMusicTransformationPlan("edit", {
    ...rightsInput(body),
    repainting_start: 0,
    repainting_end: -1,
  });
  const extension = buildMusicTemporalExtensionContract(body);
  return {
    ...editPlan,
    operation: "extend",
    service_id: extension.capability,
    capability: extension.capability,
    task_type: extension.task_type,
    implementation: "RESEARCH_ONLY",
    certification: "BENCHMARK_REQUIRED",
    executable: false,
    temporal_extension: extension,
    generation: {
      ...editPlan.generation,
      duration_seconds: null,
      source_duration_measured_by_worker: true,
    },
    provider_parameters: {
      extension_seconds: extension.extension_seconds,
      continuity_overlap_seconds: extension.continuity_overlap_seconds,
      temporal_extend_strategy: extension.strategy,
      source_asset_id: extension.source_asset_id,
      source_version_id: extension.source_version_id,
    },
    output_spec: {
      ...editPlan.output_spec,
      duration_seconds: null,
      duration_rule: "SOURCE_DURATION_PLUS_EXTENSION_SECONDS_BOUNDED_BY_WORKER_MAX",
      creates_new_version: true,
      preserve_source_before_overlap: true,
      post_render_dailies_required: true,
      post_render_release_manifest_required: true,
    },
  };
}

function plan(body) {
  const operation = resolveOperation(body.operation);
  const transformPlan = operation === "extend"
    ? buildTemporalExtendPlan(body)
    : buildMusicTransformationPlan(operation, rightsInput(body));
  return {
    success: true,
    operation,
    plan: transformPlan,
    plan_fingerprint: fingerprint(transformPlan),
    ready_for_execution: transformPlan.executable === true,
    production_certified: transformPlan.executable === true,
    execution_submitted: false,
    execution_route_enabled: transformPlan.executable === true,
    rights_confirmation_required: true,
    content_restriction_policy: transformPlan.content_restriction_policy,
    blocking_certification: transformPlan.executable === true ? null : transformPlan.certification,
  };
}

async function executeTransformation(body) {
  const organizationId = text(body.organization_id);
  const reviewed = plan(body);
  const expected = text(body.expected_plan_fingerprint);
  if (!expected) {
    const error = new Error("CREATIVE_MUSIC_TRANSFORM_PLAN_FINGERPRINT_REQUIRED");
    error.status = 409;
    throw error;
  }
  if (expected !== reviewed.plan_fingerprint) {
    const error = new Error("CREATIVE_MUSIC_TRANSFORM_PLAN_CHANGED");
    error.status = 409;
    throw error;
  }
  const transform = reviewed.plan;
  if (transform.executable !== true || transform.certification !== "CERTIFIED") {
    const error = new Error(`CREATIVE_MUSIC_TRANSFORM_NOT_CERTIFIED:${transform.certification || "NOT_READY"}`);
    error.status = 503;
    throw error;
  }
  const result = await executeService({
    organization_id: organizationId,
    bill_to_organization_id: organizationId,
    entity_id: text(body.entity_id) || null,
    service_id: transform.service_id,
    capability: transform.capability,
    input: {
      title: transform.session?.title || `${reviewed.operation} music`,
      description: transform.session?.direction || null,
      quantity: transform.output_spec?.duration_seconds || transform.session?.duration_seconds || 0,
      currency: text(body.currency || "THB"),
      source_audio: transform.source_audio,
      task_type: transform.task_type,
      rights_attestation: transform.rights_attestation,
      generation: transform.generation,
      provider_parameters: transform.provider_parameters,
      requirements: { output_spec: transform.output_spec },
      output_spec: transform.output_spec,
    },
    metadata: {
      module: "CREATIVE",
      operation: `AVANTIQO_MUSIC_${reviewed.operation.toUpperCase()}_EXECUTE`,
      creative_project_id: text(body.creative_project_id) || null,
      creative_mission_id: text(body.creative_mission_id) || null,
      transform_plan_fingerprint: reviewed.plan_fingerprint,
      source_rights_attestation: transform.rights_attestation,
      provider_selection_exposed: false,
      user_prompt_surface: false,
      preserve_source_asset: true,
    },
    provider_policy: { preferred_providers: ["avantiqo-audio"] },
    category: "AI",
  });
  return {
    success: result?.failed !== true,
    operation: reviewed.operation,
    plan_fingerprint: reviewed.plan_fingerprint,
    pending: result?.pending === true,
    failed: result?.failed === true,
    provider_status: result?.provider_status || null,
    provider_job_submitted: Boolean(result?.pending || result?.usage?.provider_request_id || result?.provider_job_id),
    usage_id: result?.usage?.id || null,
    result,
    publication_authorized: false,
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
          ? await executeTransformation(body)
          : null;
    if (!result) {
      return NextResponse.json({ success: false, error: "CREATIVE_MUSIC_TRANSFORM_ACTION_INVALID" }, { status: 400 });
    }
    return NextResponse.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Creative Music transformation failed",
        code: error?.code || null,
      },
      { status: error?.status || 400 },
    );
  }
}
