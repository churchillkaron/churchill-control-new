export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value) {
  return String(value ?? "").trim();
}

function ageSeconds(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? Math.max(0, Math.round((Date.now() - time) / 1000)) : null;
}
function classifyLocalJob(job = {}) {
  const usage = text(job.usage_id).toLowerCase();
  const workload = text(job.workload).toLowerCase();
  const certification = /(canary|cert(?:ification)?|benchmark|probe|smoke|migration|test)/i.test(usage)
    || usage.startsWith("local-elastic-")
    || usage.startsWith("media-canary-")
    || usage.startsWith("node01-music-")
    || workload.includes("certification");
  return certification ? "CERTIFICATION" : "OPERATIONAL";
}

function localExecutionResource(job = {}) {
  const explicit = text(job.result?.execution_resource).toUpperCase();
  if (["LOCAL_GPU", "LOCAL_CPU"].includes(explicit)) return explicit;
  const workload = text(job.workload).toLowerCase();
  const model = text(job.result?.runtime_model || job.model).toLowerCase();
  if (workload === "music_elastic" || workload === "media_ffmpeg" || model.includes("ffmpeg") || model.includes("signalsmith")) return "LOCAL_CPU";
  if (["music_separator", "music_vocal_correction", "voice_stt", "voice_tts", "image_upscale", "intelligence_text"].includes(workload) || model.includes("demucs") || model.includes("torchcrepe") || model.includes("whisper") || model.includes("chatterbox") || model.includes("swin2sr") || model.includes("qwen")) return "LOCAL_GPU";
  return job.node_id ? "LOCAL_OTHER" : "UNASSIGNED";
}

function productArea({ workload, capability, usageId, provider } = {}) {
  const source = [workload, capability, usageId, provider].map((value) => text(value).toLowerCase()).join(" ");
  if (/text.to.speech|voice_tts|chatterbox|tts/.test(source)) return "Voice / TTS";
  if (/speech|voice|stt|transcri/.test(source)) return "Voice / STT";
  if (/music|audio|elastic|sfx|separator|vocal/.test(source)) return "Music / Audio";
  if (/video|ffmpeg|media|post.production|master|derivative/.test(source)) return "Video / Media";
  if (/image|upscale|inpaint|outpaint|vision/.test(source)) return "Image Studio";
  if (/document|ocr|classif/.test(source)) return "Documents / OCR";
  if (/learning|benchmark|training|curriculum/.test(source)) return "Intelligence Learning";
  if (/creative|studio|direction|tribunal/.test(source)) return "Creative Studio";
  if (/business.partner|operator|conversation|intelligence_text|text.generate|qwen/.test(source)) return "Business Partner / Intelligence";
  return "Platform / Other";
}



async function loadModalTelemetry({ organizationId, since }) {
  const recentResult = await supabaseAdmin.from("platform_service_usage")
    .select("id,provider,capability,operation,provider_model,supplier_cost,currency,status,latency_ms,provider_latency_ms,provider_request_id,created_at")
    .eq("organization_id", organizationId)
    .gte("created_at", since)
    .like("provider_request_id", "modal-%")
    .order("created_at", { ascending: false })
    .limit(100);
  if (recentResult.error) {
    return { available: false, rows: [], summary: {}, reason: "USAGE_LEDGER_UNAVAILABLE" };
  }

  const pageSize = 500;
  const maxPages = 10;
  const rows = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const result = await supabaseAdmin.from("platform_service_usage")
      .select("status,supplier_cost,currency,latency_ms,provider_latency_ms,created_at")
      .eq("organization_id", organizationId)
      .gte("created_at", since)
      .like("provider_request_id", "modal-%")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (result.error) {
      return { available: false, rows: recentResult.data || [], summary: {}, reason: "USAGE_LEDGER_UNAVAILABLE" };
    }
    const pageRows = result.data || [];
    rows.push(...pageRows);
    if (pageRows.length < pageSize) break;
  }
  const latencies = rows
    .map((row) => Number(row.provider_latency_ms || row.latency_ms || 0))
    .filter((value) => value > 0);
  return {
    available: true,
    rows: recentResult.data || [],
    reason: null,
    summary: {
      calls: rows.length,
      successful_calls: rows.filter((row) => row.status === "SUCCESS").length,
      failed_calls: rows.filter((row) => row.status === "FAILED").length,
      pending_calls: rows.filter((row) => row.status === "PENDING").length,
      supplier_cost: rows.reduce((sum, row) => sum + Number(row.supplier_cost || 0), 0),
      currency: text(rows.find((row) => row.currency)?.currency) || "THB",
      average_latency_ms: latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : null,
      last_used_at: rows[0]?.created_at || null,
      truncated: rows.length === pageSize * maxPages,
    },
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status || 403 });
    }
    const platformRoles = new Set(["PLATFORM_OWNER", "SUPER_ADMIN"]);
    if (!platformRoles.has(text(access.role).toUpperCase())) {
      return NextResponse.json({ success: false, error: "Platform operator access required" }, { status: 403 });
    }

    const modalSince = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)).toISOString();
    const [nodesResult, jobsResult, modalTelemetry] = await Promise.all([
      supabaseAdmin.from("avantiqo_local_compute_nodes")
        .select("id,display_name,enabled,capabilities,last_seen_at,metadata,created_at,updated_at")
        .order("created_at", { ascending: true }),
      supabaseAdmin.from("avantiqo_local_compute_jobs")
        .select("id,usage_id,capability,lane,workload,model,status,priority,node_id,attempts,max_attempts,metrics,result,error_code,created_at,started_at,completed_at,updated_at")
        .eq("organization_id", access.organizationId)
        .order("created_at", { ascending: false })
        .limit(100),
      loadModalTelemetry({ organizationId: access.organizationId, since: modalSince }),
    ]);
    if (nodesResult.error) throw nodesResult.error;
    if (jobsResult.error) throw jobsResult.error;
    const modalSummary = modalTelemetry.summary || {};

    const nodes = (nodesResult.data || []).map((node) => {
      const heartbeatAge = ageSeconds(node.last_seen_at);
      return {
        ...node,
        heartbeat_age_seconds: heartbeatAge,
        online: node.enabled === true && heartbeatAge !== null && heartbeatAge <= 90,
      };
    });
    const jobs = (jobsResult.data || []).map((job) => ({
      ...job,
      job_class: classifyLocalJob(job),
      runtime_model: text(job.result?.runtime_model) || text(job.model) || null,
      infrastructure_provider: text(job.result?.infrastructure_provider) || (job.node_id ? "AVANTIQO_LOCAL_NODE_V1" : null),
      execution_path: job.node_id ? `LOCAL_QUEUE → ${job.node_id}` : "UNASSIGNED",
      execution_resource: localExecutionResource(job),
      product_area: productArea({ workload: job.workload, capability: job.capability, usageId: job.usage_id }),
      result: undefined,
    }));
    const modalUsage = (modalTelemetry.rows || []).map((row) => {
      const requestPath = text(row.provider_request_id).split(":")[0] || "modal";
      return {
        id: row.id,
        created_at: row.created_at,
        provider: text(row.provider) || null,
        capability: text(row.capability) || null,
        operation: text(row.operation) || null,
        model: text(row.provider_model) || null,
        request_path: requestPath,
        supplier_cost: Number(row.supplier_cost || 0),
        currency: text(row.currency) || "THB",
        status: text(row.status) || null,
        latency_ms: Number(row.provider_latency_ms || row.latency_ms || 0) || null,
        product_area: productArea({ capability: row.capability, usageId: row.operation, provider: row.provider }),
      };
    });
    const operationalJobs = jobs.filter((job) => job.job_class === "OPERATIONAL");
    const certificationJobs = jobs.filter((job) => job.job_class === "CERTIFICATION");
    const queueDepth = operationalJobs.filter((job) => ["QUEUED", "RUNNING"].includes(job.status)).length;
    const completed = operationalJobs.filter((job) => job.status === "COMPLETED");
    const failed = operationalJobs.filter((job) => job.status === "FAILED");
    const terminalOperational = completed.length + failed.length;
    const operationalSuccessRate = terminalOperational ? Math.round((completed.length / terminalOperational) * 1000) / 10 : null;
    const localGpuJobs = operationalJobs.filter((job) => job.execution_resource === "LOCAL_GPU");
    const localCpuJobs = operationalJobs.filter((job) => job.execution_resource === "LOCAL_CPU");
    const latencyRows = completed.map((job) => Number(job.metrics?.elapsed_ms || 0)).filter((value) => value > 0);
    const averageLatencyMs = latencyRows.length
      ? Math.round(latencyRows.reduce((sum, value) => sum + value, 0) / latencyRows.length)
      : null;
    const localElapsedMs = completed.reduce((sum, job) => sum + Number(job.metrics?.elapsed_ms || 0), 0);
    const todayKey = new Date().toISOString().slice(0, 10);
    const localTodayMs = completed.filter((job) => text(job.completed_at || job.updated_at).slice(0, 10) === todayKey)
      .reduce((sum, job) => sum + Number(job.metrics?.elapsed_ms || 0), 0);
    const activeJob = operationalJobs.find((job) => job.status === "RUNNING") || null;
    const modalCostsByCapability = new Map();
    for (const row of modalUsage) {
      const capability = text(row.capability);
      const cost = Number(row.supplier_cost || 0);
      if (!capability || !(cost > 0)) continue;
      const current = modalCostsByCapability.get(capability) || { total: 0, count: 0 };
      current.total += cost; current.count += 1; modalCostsByCapability.set(capability, current);
    }
    let estimatedAvoidedSupplierCost = 0;
    let comparableLocalJobs = 0;
    for (const job of completed) {
      const sample = modalCostsByCapability.get(text(job.capability));
      if (!sample?.count) continue;
      estimatedAvoidedSupplierCost += sample.total / sample.count;
      comparableLocalJobs += 1;
    }
    const certifiedLocalCapabilities = new Set(["ai.text.generate","ai.speech.to.text","ai.image.upscale","ai.audio.stems","ai.audio.vocal-correct","media.ffmpeg.process","ai.audio.elastic-warp"]);
    const modalFallbackCalls = modalUsage.filter((row) => certifiedLocalCapabilities.has(text(row.capability))).length;

    const candidateMatrix = [
      { product: "Business Partner / Intelligence", capability: "ai.text.generate", model: "qwen3:4b-instruct", status: "CERTIFIED_LOCAL", resource: "GPU" },
      { product: "Voice / STT", capability: "ai.speech.to.text", model: "openai/whisper-large-v3-turbo", status: "CERTIFIED_LOCAL", resource: "GPU" },
      { product: "Voice / TTS", capability: "ai.text.to.speech", model: "resemble-ai/chatterbox:multilingual-v3", status: "CERTIFIED_LOCAL_BACKGROUND_MODAL_INTERACTIVE", resource: "GPU" },
      { product: "Image Studio", capability: "ai.image.upscale", model: "caidas/swin2SR-realworld-sr-x4-64-bsrgan-psnr", status: "CERTIFIED_LOCAL", resource: "GPU" },
      { product: "Music / Audio", capability: "ai.audio.stems", model: "demucs-htdemucs-ft", status: "CERTIFIED_LOCAL", resource: "GPU" },
      { product: "Music / Audio", capability: "ai.audio.vocal-correct", model: "torchcrepe-full", status: "CERTIFIED_LOCAL", resource: "GPU" },
      { product: "Video / Media", capability: "media.ffmpeg.process", model: "ffmpeg-9.0.1", status: "CERTIFIED_LOCAL", resource: "CPU" },
      { product: "Music / Audio", capability: "ai.audio.elastic-warp", model: "signalsmith-stretch", status: "CERTIFIED_LOCAL", resource: "CPU" },
      { product: "Documents / OCR", capability: "vision.ocr", model: "qwen2.5-vl-7b", status: "MODAL_KEEP_EXACT_MODEL_TOO_LARGE", resource: "GPU" },
      { product: "Image / Video generation", capability: "generation", model: "specialist production models", status: "MODAL_KEEP_SPECIALIST_GPU", resource: "GPU" },
    ];

    return NextResponse.json({
      success: true,
      generated_at: new Date().toISOString(),
      organization_id: access.organizationId,
      routing: {
        normal_intelligence: "LOCAL_FIRST",
        deep_intelligence: "MODAL",
        heavy_generation: "MODAL",
        bounded_studio_reasoning: "LOCAL_GPU_QWEN4B_FIRST",
        deep_creative_reasoning: "MODAL_HEAVY_ONLY_WHEN_REQUIRED",
        media_dsp: "LOCAL_CPU_FIRST",
        music_gpu: "LOCAL_GPU_DEMUCS_TORCHCREPE_FIRST",
        image_upscale: "LOCAL_GPU_SWIN2SR_FIRST",
        voice_stt: "LOCAL_GPU_WHISPER_LARGE_V3_TURBO_FIRST",
        voice_tts: "LOCAL_GPU_BACKGROUND_MODAL_INTERACTIVE",
        local_transport: "SUPABASE_PULL_QUEUE_V1",
      },
      metrics: {
        nodes_total: nodes.length,
        nodes_online: nodes.filter((node) => node.online).length,
        queue_depth: queueDepth,
        completed_jobs: completed.length,
        failed_jobs: failed.length,
        operational_success_rate: operationalSuccessRate,
        certification_jobs: certificationJobs.length,
        certification_failed_jobs: certificationJobs.filter((job) => job.status === "FAILED").length,
        average_latency_ms: averageLatencyMs,
        local_gpu_jobs: localGpuJobs.length,
        local_gpu_completed_jobs: localGpuJobs.filter((job) => job.status === "COMPLETED").length,
        local_gpu_failed_jobs: localGpuJobs.filter((job) => job.status === "FAILED").length,
        local_cpu_jobs: localCpuJobs.length,
        local_cpu_completed_jobs: localCpuJobs.filter((job) => job.status === "COMPLETED").length,
        local_cpu_failed_jobs: localCpuJobs.filter((job) => job.status === "FAILED").length,
        modal_telemetry_available: modalTelemetry.available === true,
        modal_telemetry_reason: modalTelemetry.reason || null,
        modal_calls_30d: Number(modalSummary.calls || 0),
        modal_successful_calls_30d: Number(modalSummary.successful_calls || 0),
        modal_failed_calls_30d: Number(modalSummary.failed_calls || 0),
        modal_supplier_cost_30d: Number(modalSummary.supplier_cost || 0),
        modal_currency: text(modalSummary.currency) || "THB",
        modal_average_latency_ms_30d: Number(modalSummary.average_latency_ms || 0) || null,
        modal_last_used_at: modalSummary.last_used_at || null,
        modal_summary_truncated: modalSummary.truncated === true,
        local_compute_hours_total: Math.round((localElapsedMs / 3600000) * 1000) / 1000,
        local_compute_hours_today: Math.round((localTodayMs / 3600000) * 1000) / 1000,
        active_product: activeJob?.product_area || null,
        active_model: activeJob?.runtime_model || activeJob?.model || null,
        scheduler_policy: "RESOURCE_AWARE_PRIORITY_V1",
        idle_learning_window: "01:00-06:00 local node time",
        idle_learning_promotion_authorized: false,
        estimated_avoided_supplier_cost_30d: Math.round(estimatedAvoidedSupplierCost * 1000000) / 1000000,
        estimated_avoided_supplier_cost_currency: text(modalSummary.currency) || "THB",
        estimated_avoided_supplier_cost_comparable_jobs: comparableLocalJobs,
        modal_fallback_calls_for_local_capabilities_30d: modalFallbackCalls,
      },
      nodes,
      jobs,
      modal_usage: modalUsage,
      local_candidate_matrix: candidateMatrix,
    });
  } catch (error) {
    console.error("ADMINISTRATION_COMPUTE_STATUS_FAILED", error);
    return NextResponse.json({ success: false, error: error?.message || "Compute status unavailable" }, { status: 500 });
  }
}
