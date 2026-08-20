export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import "@/lib/finance/bootstrap/registerFinanceBilling";
import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { resolveProvider } from "@/lib/platform/service-runtime/providers/ProviderResolver";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const TOKEN = "avq-investor-audio-timestamps-20260819-v1";
const BUCKET = "creative-assets";
const DURATION_SECONDS = 229.5;
const AUDIO_PATH = `${ORGANIZATION_ID}/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar-v5-founder-locked-229.5s.mp3`;

const LOCKED_BEATS = Object.freeze([
  {
    id: "origin-01",
    text: "I didn’t build Avantiqo because I wanted to create another software company.",
    visual: "FOUNDER",
  },
  {
    id: "origin-02",
    text: "I built it because running real businesses showed me the same problem again and again.",
    visual: "FOUNDER_WITH_BUSINESS_CUTAWAYS",
  },
  {
    id: "origin-03",
    text: "Finance knew one part of the business. Operations knew another. Customers, staff, suppliers and marketing all lived in different systems. Whenever I wanted to understand what was really happening, I had to put the company back together in my head.",
    visual: "DISCONNECTED_GLASS_SYSTEMS",
  },
  {
    id: "origin-04",
    text: "That made one thing obvious.",
    visual: "FOUNDER",
  },
  {
    id: "origin-05",
    text: "The business should not have to explain itself to its software. The software should understand the business.",
    visual: "FOUNDER_TO_AVANTIQO_INTELLIGENCE",
  },
  {
    id: "origin-06",
    text: "That is why I built Avantiqo.",
    visual: "FOUNDER",
  },
  {
    id: "system-01",
    text: "Avantiqo is an AI-native Business Operating System designed to bring the company into one shared operating context.",
    visual: "AUTHENTIC_PRODUCT_UI",
  },
  {
    id: "system-02",
    text: "Instead of finance living in one system, operations in another, customers somewhere else, and AI sitting on top as a disconnected chatbot, Avantiqo connects the business so information, decisions and execution can work together.",
    visual: "CONNECTED_OPERATING_CONTEXT",
  },
  {
    id: "system-03",
    text: "At the center is the organization itself: its people, entities, permissions, customers, suppliers, history and operating context. That shared context turns separate workspaces into one system.",
    visual: "ORGANIZATION_INTELLIGENCE",
  },
  {
    id: "system-04",
    text: "And that changes what software can do.",
    visual: "FOUNDER",
  },
  {
    id: "workflow-01",
    text: "A customer interaction should not end inside a messaging tool. A campaign should not be disconnected from the customer or the result it creates. A quotation, booking, task, service and follow-up should stay connected to the same business reality.",
    visual: "CUSTOMER_TO_EXECUTION_WORKFLOW",
  },
  {
    id: "workflow-02",
    text: "Avantiqo can understand what is happening, identify what needs attention, recommend the next action, ask for approval when required, and then execute.",
    visual: "AI_APPROVAL_EXECUTION",
  },
  {
    id: "workflow-03",
    text: "Understand. Recommend. Approve. Execute.",
    visual: "FOUR_STAGE_INTELLIGENCE_LOCKUP",
  },
  {
    id: "vertical-01",
    text: "The point is not one vertical.",
    visual: "FOUNDER",
  },
  {
    id: "vertical-02",
    text: "Avantiqo can enter through a painful real-world workflow, solve it deeply, and then expand across the company.",
    visual: "VERTICAL_ENTRY_HORIZONTAL_EXPANSION",
  },
  {
    id: "vertical-03",
    text: "The same operating core can work differently for different industries. Restaurants can connect orders, kitchen execution, service and payments. Hotels can coordinate front office and property operations. Healthcare can coordinate appointments, beds, pharmacy and controlled records. Field-service businesses can connect dispatch, technicians and completion evidence.",
    visual: "CROSS_INDUSTRY_MONTAGE",
  },
  {
    id: "vertical-04",
    text: "Different industries. Different workflows. One operating architecture.",
    visual: "ONE_OPERATING_ARCHITECTURE",
  },
  {
    id: "integration-01",
    text: "And the important part is what happens between them.",
    visual: "FOUNDER",
  },
  {
    id: "integration-02",
    text: "A sale can become part of the financial record. Purchasing can connect to receiving and inventory. Supplier invoices can enter controlled finance workflows. People, scheduling, payroll and compliance can stay inside the same operating structure, with the right permissions and accountability.",
    visual: "END_TO_END_BUSINESS_FLOW",
  },
  {
    id: "channels-01",
    text: "Customers, staff, suppliers and management do not need the same interface, but they can still interact with the same operating system and the same underlying truth.",
    visual: "MULTI_CHANNEL_SHARED_TRUTH",
  },
  {
    id: "channels-02",
    text: "Integrations extend Avantiqo outward to websites, communication channels, commerce and external services while the organization remains the source of operating context.",
    visual: "CHANNELS_AND_INTEGRATIONS",
  },
  {
    id: "ai-01",
    text: "This becomes even more important as AI moves from answering questions to coordinating real work.",
    visual: "FOUNDER",
  },
  {
    id: "ai-02",
    text: "AI cannot run a business responsibly without context, permissions, workflows and accountability. But when customers, operations, money, people, suppliers and communications share the same context, AI no longer sees fragments.",
    visual: "GOVERNED_AI_CONTEXT",
  },
  {
    id: "ai-03",
    text: "It can begin to understand the business itself.",
    visual: "AVANTIQO_INTELLIGENCE",
  },
  {
    id: "proof-01",
    text: "Avantiqo is already a working product, built from problems I experienced while operating real businesses. The platform is multi-company and cross-industry by design.",
    visual: "AUTHENTIC_PRODUCT_PROOF",
  },
  {
    id: "strategy-01",
    text: "Our strategy is simple: vertical entry, horizontal expansion. Solve a painful workflow first. Prove the value. Then expand through the same platform.",
    visual: "VERTICAL_ENTRY_HORIZONTAL_EXPANSION",
  },
  {
    id: "close-01",
    text: "We are not building another business application.",
    visual: "FOUNDER",
  },
  {
    id: "close-02",
    text: "We are building the system businesses will operate through.",
    visual: "FOUNDER",
  },
  {
    id: "close-03",
    text: "Avantiqo.",
    visual: "AVANTIQO_LOGO",
  },
  {
    id: "close-04",
    text: "One operating system for the intelligent enterprise.",
    visual: "AVANTIQO_LOGO",
  },
]);

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
  return (Array.isArray(items) ? items : [])
    .map((item, index) => ({
      id: item.id ?? index,
      start: Number.isFinite(Number(item.start_seconds ?? item.start))
        ? Number(item.start_seconds ?? item.start)
        : null,
      end: Number.isFinite(Number(item.end_seconds ?? item.end))
        ? Number(item.end_seconds ?? item.end)
        : null,
      text: String(item.text ?? item.word ?? ""),
    }))
    .filter((item) => item.text || item.start !== null || item.end !== null);
}

function words(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9']+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function transcriptMatchRatio(transcriptText) {
  const expected = words(LOCKED_BEATS.map((beat) => beat.text).join(" "));
  const actual = words(transcriptText);
  if (!expected.length || !actual.length) return null;
  const total = Math.min(expected.length, actual.length);
  let matches = 0;
  for (let index = 0; index < total; index += 1) {
    if (expected[index] === actual[index]) matches += 1;
  }
  return Number((matches / Math.max(expected.length, actual.length)).toFixed(4));
}

function deterministicBeatAnchors(durationSeconds = DURATION_SECONDS) {
  const weighted = LOCKED_BEATS.map((beat) => ({
    ...beat,
    word_count: Math.max(1, words(beat.text).length),
  }));
  const totalWords = weighted.reduce((sum, beat) => sum + beat.word_count, 0);
  let cursor = 0;

  return weighted.map((beat, index) => {
    const isLast = index === weighted.length - 1;
    const start = cursor;
    const share = beat.word_count / totalWords;
    const end = isLast
      ? durationSeconds
      : Math.min(durationSeconds, start + durationSeconds * share);
    cursor = end;

    return {
      id: beat.id,
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
      duration: Number((end - start).toFixed(3)),
      text: beat.text,
      visual: beat.visual,
      word_count: beat.word_count,
      estimated: true,
    };
  });
}

function supportsVerboseWordTimestamps(model) {
  return String(model || "").trim().toLowerCase() === "whisper-1";
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) {
      return json({ success: false }, 404);
    }

    const { data: signed, error: signedError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(AUDIO_PATH, 3600);
    if (signedError) throw signedError;
    if (!signed?.signedUrl) {
      throw new Error("LOCKED_FOUNDER_AUDIO_URL_REQUIRED");
    }

    const selected = await resolveProvider({
      organization_id: ORGANIZATION_ID,
      capability: "ai.speech.to.text",
      preferredProvider: "openai",
      currency: "THB",
      policy: {
        allowed_providers: ["openai"],
        preferred_models: ["whisper-1", "gpt-4o-mini-transcribe"],
      },
    });

    const selectedModel = selected?.model || null;
    const nativeTimestamps = supportsVerboseWordTimestamps(selectedModel);

    const execution = await ServiceExecutionRuntime.execute({
      organization_id: ORGANIZATION_ID,
      bill_to_organization_id: ORGANIZATION_ID,
      service_id: "ai.speech.to.text",
      provider_id: "openai",
      provider_policy: {
        allowed_providers: ["openai"],
        preferred_models: selectedModel ? [selectedModel] : [],
        weights: { preference: 100 },
      },
      input: {
        source: signed.signedUrl,
        file_name: "avantiqo-investor-narration-cedar-v5-founder-locked-229.5s.mp3",
        mime_type: "audio/mpeg",
        language: "en",
        response_format: nativeTimestamps ? "verbose_json" : "json",
        ...(nativeTimestamps
          ? { timestamp_granularities: ["word", "segment"] }
          : {}),
        quantity: DURATION_SECONDS / 60,
        currency: "THB",
      },
      metadata: {
        module: "CREATIVE",
        operation: "AVANTIQO_INVESTOR_MASTER_TIMING_PASS_V2",
        brand: "Avantiqo",
        source: "avantiqo_investor_video_20260820_founder_master_v5",
        audio_path: AUDIO_PATH,
        locked_duration_seconds: DURATION_SECONDS,
        requested_native_word_timestamps: nativeTimestamps,
      },
      category: "AI",
    });

    if (execution?.pending) {
      return json({
        success: true,
        pending: true,
        provider: execution.provider || null,
        model: execution.model || selectedModel,
        provider_job_id: execution.provider_job_id || null,
        usage_id: execution.usage?.id || null,
      });
    }

    const transcript = transcriptOutput(object(execution));
    const nativeWords = timed(transcript.words);
    const nativeSegments = timed(transcript.segments);
    const duration = Number(
      transcript.duration_seconds || transcript.duration || DURATION_SECONDS,
    );
    const anchors = deterministicBeatAnchors(duration);
    const hasNativeWords = nativeWords.length > 0;

    return json({
      success: true,
      pending: false,
      provider: execution.provider || null,
      model: execution.model || selectedModel,
      duration_seconds: duration,
      text: transcript.text || "",
      transcript_match_ratio: transcriptMatchRatio(transcript.text || ""),
      words: nativeWords,
      segments: nativeSegments,
      word_count: nativeWords.length,
      segment_count: nativeSegments.length,
      beat_anchors: anchors,
      beat_count: anchors.length,
      timing_mode: hasNativeWords
        ? "NATIVE_WORD_TIMESTAMPS"
        : "DETERMINISTIC_LOCKED_SCRIPT_ALIGNMENT",
      timing_precision: hasNativeWords ? "EXACT_PROVIDER_TIMESTAMPS" : "EDIT_BASELINE",
      native_word_timestamps_available: hasNativeWords,
      locked_script_duration_seconds: DURATION_SECONDS,
      audio_path: AUDIO_PATH,
    });
  } catch (error) {
    return json(
      { success: false, error: error?.message || String(error) },
      500,
    );
  }
}
