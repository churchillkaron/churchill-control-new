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
  const extensionSeconds = clamp(body.extension_seconds ?? body.extend_seconds, 5, 120, 30);
  const continuityOverlapSeconds = clamp(
    body.continuity_overlap_seconds ?? body.overlap_seconds,
    1,
    12,
    4,
  );
  return {
    ...editPlan,
    operation: "extend",
    service_id: "ai.audio.extend",
    capability: "ai.audio.extend",
    task_type: "repaint",
    implementation: "IMPLEMENTED",
    certification: "BENCHMARK_REQUIRED",
    executable: false,
    temporal_extension: {
      strategy: TEMPORAL_EXTEND_STRATEGY,
      source_duration_measured_by_worker: true,
      right_padding_outpaint_required: true,
      temporal_extension_proven: false,
    },
    generation: {
      ...editPlan.generation,
      duration_seconds: null,
      source_duration_measured_by_worker: true,
    },
    provider_parameters: {
      extension_seconds: extensionSeconds,
      continuity_overlap_seconds: continuityOverlapSeconds,
      temporal_extend_strategy: TEMPORAL_EXTEND_STRATEGY,
    },
    output_spec: {
      ...editPlan.output_spec,
      duration_seconds: null,
      duration_rule: "SOURCE_DURATION_PLUS_EXTENSION_SECONDS_BOUNDED_BY_WORKER_MAX",
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
    ready_for_execution: transformPlan.executable === true,
    production_certified: transformPlan.executable === true,
    execution_submitted: false,
    execution_route_enabled: false,
    rights_confirmation_required: true,
    content_restriction_policy: transformPlan.content_restriction_policy,
    blocking_certification: transformPlan.executable === true ? null : transformPlan.certification,
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
