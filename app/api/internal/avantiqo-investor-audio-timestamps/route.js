export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import "@/lib/finance/bootstrap/registerFinanceBilling";
import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const TOKEN = "avq-investor-audio-timestamps-20260819-v1";
const BUCKET = "creative-assets";
const AUDIO_PATH = "33336a72-acb5-474e-856b-8be0269360e2/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar-v5-founder-locked-229.5s.mp3";

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function transcriptOutput(value, depth = 0) {
  if (depth > 10 || !value || typeof value !== "object") return {};
  if (
    typeof value.text === "string" ||
    Array.isArray(value.words) ||
    Array.isArray(value.segments)
  ) {
    return value;
  }
  for (const key of ["output", "raw", "result", "provider_result", "response"]) {
    const found = transcriptOutput(value[key], depth + 1);
    if (
      typeof found.text === "string" ||
      Array.isArray(found.words) ||
      Array.isArray(found.segments)
    ) {
      return found;
    }
  }
  return {};
}

function timed(items = []) {
  return (Array.isArray(items) ? items : []).map((item, index) => ({
    id: item.id ?? index,
    start: Number.isFinite(Number(item.start_seconds ?? item.start))
      ? Number(item.start_seconds ?? item.start)
      : null,
    end: Number.isFinite(Number(item.end_seconds ?? item.end))
      ? Number(item.end_seconds ?? item.end)
      : null,
    text: String(item.text ?? item.word ?? ""),
  })).filter((item) => item.text || item.start !== null || item.end !== null);
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);

    const { data: signed, error: signedError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(AUDIO_PATH, 3600);
    if (signedError) throw signedError;
    if (!signed?.signedUrl) throw new Error("LOCKED_FOUNDER_AUDIO_URL_REQUIRED");

    const execution = await ServiceExecutionRuntime.execute({
      organization_id: ORGANIZATION_ID,
      bill_to_organization_id: ORGANIZATION_ID,
      service_id: "ai.speech.to.text",
      input: {
        source: signed.signedUrl,
        file_name: "avantiqo-investor-narration-cedar-v5-founder-locked-229.5s.mp3",
        mime_type: "audio/mpeg",
        language: "en",
        response_format: "verbose_json",
        timestamp_granularities: ["word", "segment"],
        quantity: 229.5 / 60,
      },
      metadata: {
        module: "CREATIVE",
        operation: "AVANTIQO_INVESTOR_MASTER_EXACT_TIMESTAMPS_V1",
        brand: "Avantiqo",
        source: "avantiqo_investor_video_20260819_founder_master_v5",
        audio_path: AUDIO_PATH,
      },
      category: "AI",
    });

    if (execution?.pending) {
      return json({
        success: true,
        pending: true,
        provider: execution.provider || null,
        provider_job_id: execution.provider_job_id || null,
        usage_id: execution.usage?.id || null,
      });
    }

    const transcript = transcriptOutput(object(execution));
    const words = timed(transcript.words);
    const segments = timed(transcript.segments);

    return json({
      success: true,
      pending: false,
      provider: execution.provider || null,
      model: execution.model || null,
      duration_seconds: Number(transcript.duration_seconds || transcript.duration || 229.5),
      text: transcript.text || "",
      words,
      segments,
      word_count: words.length,
      segment_count: segments.length,
      audio_path: AUDIO_PATH,
    });
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
