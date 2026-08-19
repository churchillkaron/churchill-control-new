export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import {
  AvantiqoInvestorFilmFinishingRuntime,
} from "@/lib/creative/post-production/runtime/AvantiqoInvestorFilmFinishingRuntime";
import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TOKEN = "avq-investor-finish-20260819";
const ORGANIZATION_ID = AvantiqoInvestorFilmFinishingRuntime.ORGANIZATION_ID;
const ENTITY_ID = AvantiqoInvestorFilmFinishingRuntime.ENTITY_ID;
const SCORE_PATH = AvantiqoInvestorFilmFinishingRuntime.SCORE_PATH;
const BUCKET = AvantiqoInvestorFilmFinishingRuntime.BUCKET;

const SCORE_PROMPT = [
  "Instrumental premium investor-film score for Avantiqo, an AI-native Business Operating System.",
  "World-class technology documentary tone: intelligent, restrained, modern, cinematic and emotionally confident.",
  "Start with sparse low piano and soft sub texture, build gradually with elegant pulsing percussion, warm strings, subtle modern synth architecture and a controlled sense of scale.",
  "No vocals. No pop melody. No cheesy corporate uplift. No trailer booms. No aggressive EDM.",
  "The music must leave generous space for spoken narration and support a four-minute story that moves from fragmented business pain to clarity, connected execution, real-world field operations, multi-company scale and an assured final reveal.",
  "Use subtle chapter lifts approximately every 35 to 50 seconds and a refined, memorable final resolve suitable for a premium global B2B technology film.",
].join(" ");

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function copyProviderOutputToScore(result) {
  const output =
    result?.output?.raw?.output ||
    result?.output?.output ||
    result?.output ||
    result?.raw?.output ||
    null;
  const sourcePath =
    output?.storage_path ||
    output?.storagePath ||
    null;
  const sourceBucket =
    output?.storage_bucket ||
    output?.storageBucket ||
    BUCKET;

  if (!sourcePath) return null;
  if (sourceBucket === BUCKET && sourcePath === SCORE_PATH) {
    return { bucket: BUCKET, path: SCORE_PATH, reused: true };
  }

  const { data, error } = await supabaseAdmin.storage
    .from(sourceBucket)
    .download(sourcePath);
  if (error) throw error;
  if (!data) throw new Error("INVESTOR_SCORE_DOWNLOAD_EMPTY");

  const bytes = Buffer.from(await data.arrayBuffer());
  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(SCORE_PATH, bytes, {
      contentType: "audio/mpeg",
      upsert: true,
      cacheControl: "3600",
    });
  if (uploadError) throw uploadError;

  return { bucket: BUCKET, path: SCORE_PATH, bytes: bytes.length };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) {
      return json({ success: false }, 404);
    }

    const action = url.searchParams.get("action") || "status";

    if (action === "status") {
      return json({
        success: true,
        status: await AvantiqoInvestorFilmFinishingRuntime.status(),
      });
    }

    if (action === "start_score") {
      const result = await executeService({
        organization_id: ORGANIZATION_ID,
        bill_to_organization_id: ORGANIZATION_ID,
        entity_id: ENTITY_ID,
        service_id: "ai.music.generate",
        provider_id: "fal",
        input: {
          capability: "ai.music.generate",
          prompt: SCORE_PROMPT,
          instrumental: true,
          duration_seconds: 240,
          quantity: 240,
          currency: "THB",
        },
        metadata: {
          module: "CREATIVE",
          operation: "AVANTIQO_INVESTOR_FILM_SCORE_V1",
          brand: "Avantiqo",
          source: "avantiqo_investor_film_score_20260819_v1",
          provider_priority: ["fal"],
        },
        category: "AI",
      });

      return json({
        success: true,
        pending: result?.pending ?? null,
        provider: result?.provider || null,
        model: result?.model || null,
        provider_job_id: result?.provider_job_id || null,
        provider_status: result?.provider_status || null,
        usage_id: result?.usage?.id || null,
        credential_id: result?.credential_id || null,
        pricing: result?.pricing || null,
        started_at: result?.started_at || null,
        output: result?.output || null,
      });
    }

    if (action === "poll_score") {
      const provider = url.searchParams.get("provider") || "fal";
      const providerJobId = url.searchParams.get("provider_job_id");
      const usageId = url.searchParams.get("usage_id");
      const credentialId = url.searchParams.get("credential_id") || null;
      const startedAt = url.searchParams.get("started_at") || null;

      if (!providerJobId || !usageId) {
        return json({ success: false, error: "Missing poll parameters" }, 400);
      }

      const result = await settlePendingService({
        organization_id: ORGANIZATION_ID,
        provider,
        provider_job_id: providerJobId,
        usage_id: usageId,
        credential_id: credentialId,
        started_at: startedAt,
        metadata: {
          module: "CREATIVE",
          operation: "AVANTIQO_INVESTOR_FILM_SCORE_V1_POLL",
          brand: "Avantiqo",
          source: "avantiqo_investor_film_score_20260819_v1",
        },
      });

      let copied = null;
      if (result?.pending === false && result?.failed !== true) {
        copied = await copyProviderOutputToScore(result);
      }

      return json({ success: true, result, copied });
    }

    if (action === "render") {
      const mode = url.searchParams.get("mode") || "review";
      const useScore = url.searchParams.get("score") !== "false";
      const result = await AvantiqoInvestorFilmFinishingRuntime.render({
        mode,
        useScore,
      });
      return json(result);
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json(
      { success: false, error: error?.message || String(error) },
      500,
    );
  }
}
