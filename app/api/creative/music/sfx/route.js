export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { executeService, settlePendingService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { UsageRuntime } from "@/lib/platform/service-runtime/usage/UsageRuntime";
import { resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { PROVIDER_REGISTRY } from "@/lib/platform/service-runtime/providers/ProviderRegistry";
import "@/lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration";

const CAPABILITY = "ai.sfx.generate";
const PERMISSIONS = Object.freeze(["creative.execute", "creative.production.run", "creative.*"]);
const MAX_DURATION_SECONDS = 30;

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = null) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }

async function requireAccess(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request, requiredAnyPermission: PERMISSIONS });
  if (!access.success) { const error = new Error(access.error || "CREATIVE_MUSIC_SFX_ACCESS_FORBIDDEN"); error.status = access.status || 403; throw error; }
}

function readiness() {
  const provider = PROVIDER_REGISTRY["avantiqo-audio"] || {};
  const runtime = provider?.metadata?.sfx_runtime || {};
  const ready = runtime.production_routing_allowed === true && Array.isArray(provider.capabilities) && provider.capabilities.includes(CAPABILITY);
  return {
    ready,
    capability: CAPABILITY,
    provider: "avantiqo-audio",
    runtime_status: text(runtime.runtime_status) || null,
    product_model: text(runtime.product_model) || "avantiqo-sfx-v1",
    foundation_model: text(runtime.foundation_model) || null,
    quality_profile: text(runtime.quality_profile) || null,
    maximum_duration_seconds: finite(runtime.maximum_duration_seconds, MAX_DURATION_SECONDS),
    blocker: ready ? null : "CREATIVE_MUSIC_SFX_CERTIFICATION_REQUIRED",
  };
}


function outputPayload(result = {}) {
  const first = result?.output && typeof result.output === "object" ? result.output : {};
  return first.output && typeof first.output === "object" ? first.output : first;
}

async function exposeOutput(organizationId, result) {
  const output = outputPayload(result);
  const reference = text(output.storage_reference || output.storageReference);
  return {
    output,
    storage_reference: reference || null,
    playback_url: reference ? await resolveCreativeProviderAssetUrl({ organization_id: organizationId, value: reference }) : null,
  };
}

async function status(body = {}) {
  const organizationId = text(body.organization_id);
  const usageId = text(body.usage_id);
  if (!usageId) throw new Error("usage_id required");
  const usage = await UsageRuntime.get(usageId);
  if (!usage || text(usage.organization_id) !== organizationId || text(usage.capability) !== CAPABILITY) { const error = new Error("CREATIVE_MUSIC_SFX_USAGE_NOT_FOUND"); error.status = 404; throw error; }
  const providerJobId = text(usage.provider_request_id || usage.metadata?.provider_request_id);
  if (!providerJobId) throw new Error("CREATIVE_MUSIC_SFX_PROVIDER_JOB_REQUIRED");
  const result = await settlePendingService({ organization_id: organizationId, provider: text(usage.provider), provider_job_id: providerJobId, usage_id: usageId, pricing: {}, quantity: finite(usage.quantity, null), unit: text(usage.unit) || null, credential_id: null, started_at: text(usage.execution_started_at || usage.created_at) || null, metadata: { module: "CREATIVE", operation: "AVANTIQO_MUSIC_SFX_SETTLE", creative_project_id: text(usage.metadata?.creative_project_id) || null, creative_mission_id: text(usage.metadata?.creative_mission_id) || null } });
  const exposed = result?.pending ? { output: result?.output || null, storage_reference: null, playback_url: null } : await exposeOutput(organizationId, result);
  return { success: result?.failed !== true, pending: result?.pending === true, failed: result?.failed === true, usage_id: usageId, provider_status: result?.provider_status || null, settlement: result?.settlement || null, ...exposed, publication_authorized: false };
}

function plan(body = {}) {
  const instruction = text(body.instruction || body.description || body.title);
  if (!instruction) throw new Error("CREATIVE_MUSIC_SFX_INSTRUCTION_REQUIRED");
  const duration = finite(body.duration_seconds, 5);
  if (!duration || duration <= 0 || duration > MAX_DURATION_SECONDS) throw new Error(`CREATIVE_MUSIC_SFX_DURATION_INVALID:max=${MAX_DURATION_SECONDS}`);
  const state = readiness();
  return {
    success: true,
    contract: "AVANTIQO_MUSIC_SFX_PLAN_V1",
    instruction,
    duration_seconds: duration,
    generation: {
      instruction,
      duration_seconds: duration,
      sync_point_seconds: finite(body.sync_point_seconds, null),
      category: text(body.category) || "SFX",
      intensity: text(body.intensity) || null,
      perspective: text(body.perspective) || null,
    },
    readiness: state,
    ready_for_execution: state.ready,
    publication_authorized: false,
  };
}

async function execute(body = {}) {
  const organizationId = text(body.organization_id);
  const reviewed = plan(body);
  if (!reviewed.ready_for_execution) { const error = new Error(reviewed.readiness.blocker); error.status = 503; throw error; }
  const result = await executeService({
    organization_id: organizationId,
    bill_to_organization_id: organizationId,
    entity_id: text(body.entity_id) || null,
    service_id: CAPABILITY,
    capability: CAPABILITY,
    input: {
      title: text(body.title || "Music Studio SFX"),
      description: reviewed.instruction,
      quantity: reviewed.duration_seconds,
      currency: text(body.currency || "THB"),
      generation: reviewed.generation,
      requirements: { output_spec: { format: "wav", sample_rate: 48000, channels: 2, duration_seconds: reviewed.duration_seconds } },
      output_spec: { format: "wav", sample_rate: 48000, channels: 2, duration_seconds: reviewed.duration_seconds },
    },
    metadata: {
      module: "CREATIVE",
      operation: "AVANTIQO_MUSIC_SFX_EXECUTE",
      creative_project_id: text(body.creative_project_id) || null,
      creative_mission_id: text(body.creative_mission_id) || null,
      provider_selection_exposed: false,
      publication_authorized: false,
    },
    provider_policy: { preferred_providers: ["avantiqo-audio"], allowed_providers: ["avantiqo-audio"] },
    category: "AI",
  });
  const exposed = result?.pending ? { output: result?.output || null, storage_reference: null, playback_url: null } : await exposeOutput(organizationId, result);
  return {
    success: result?.failed !== true,
    pending: result?.pending === true,
    failed: result?.failed === true,
    usage_id: result?.usage?.id || null,
    provider_status: result?.provider_status || null,
    settlement: result?.settlement || null,
    ...exposed,
    publication_authorized: false,
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id);
    if (!organizationId) return NextResponse.json({ success: false, error: "organization_id required" }, { status: 400 });
    await requireAccess(request, organizationId);
    const action = text(body.action || "plan").toLowerCase();
    const result = action === "plan" ? plan(body) : action === "execute" ? await execute(body) : action === "status" ? await status(body) : null;
    if (!result) return NextResponse.json({ success: false, error: "CREATIVE_MUSIC_SFX_ACTION_INVALID" }, { status: 400 });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Creative Music SFX failed" }, { status: error?.status || 400 });
  }
}
