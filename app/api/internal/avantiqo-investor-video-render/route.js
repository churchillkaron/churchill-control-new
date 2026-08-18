export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import "@/lib/finance/bootstrap/registerFinanceBilling";

import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const ACCESS_TOKEN = "avq-render-20260818-7d3c9a1f4b62";

const NARRATION = `Businesses have software for every department. But most companies still do not have software that understands the whole business.

Avantiqo is an AI-native Business Operating System designed to bring the company into one shared operating context.

Instead of finance living in one system, operations in another, customers somewhere else, and AI sitting on top as a disconnected chatbot, Avantiqo connects the core business domains so information, decisions and execution can work together.

At the center is the organization itself. Avantiqo understands companies, workspaces, users, permissions, entities and operating context. That shared context is what allows every workspace to become part of one system rather than another isolated application.

Communications connect conversations and customer interactions directly to the business. Operations gives teams a clear command center for daily execution. Industry workspaces can then add the capabilities each company actually needs.

Here, restaurant operations are one example. Orders, service workflows and operational control live inside the same platform architecture. The important point is not one vertical. It is that Avantiqo can enter through a real operational problem and expand across the company.

Procurement brings purchasing, supplier activity, receiving and control into the same environment. Finance adds journals, accounting workflows, reporting and governance. Because these areas share organization context, financial control can follow operational activity instead of being reconstructed later from disconnected tools.

People, projects and administration are connected too. Teams can work across roles, responsibilities, projects, policies and access controls without losing the business context around the work.

Integrations extend the platform outward. Avantiqo is designed to connect websites, communication channels, commerce systems, external services and future AI agents while keeping the company itself as the source of operating context.

This is already a working product, built from problems experienced while operating real businesses. The platform is multi-company and cross-industry by design, with the long-term goal of giving companies one intelligent operating layer instead of a growing collection of disconnected software.

The opportunity is larger than replacing individual applications. As AI moves from answering questions to coordinating work, it needs reliable company context, permissions, workflows and accountability. That is the infrastructure Avantiqo is building.

Our go-to-market strategy is vertical entry, horizontal expansion: solve a painful workflow first, prove value, then expand into more of the organization through the same platform.

We are raising five hundred thousand US dollars to harden the product, accelerate commercial launch and establish repeatable adoption beyond our initial operating environments.

Avantiqo is building toward a future where the business does not have to explain itself to every new piece of software.

The system already understands the company.

Avantiqo. One operating system for the intelligent enterprise.

Created with Avantiqo.`;

const MUSIC_DIRECTION = `Premium cinematic technology score for an AI-native enterprise software film. Begin restrained, elegant and intelligent with a dark modern pulse, subtle piano and atmospheric synth texture. Build gradually into confident forward momentum with precise percussion, warm low-end and uplifting harmonic movement. Create clear editorial beats for product reveals, finance and operations sections, then rise into an optimistic enterprise-scale finale. No vocals. No aggressive EDM. No cheesy corporate music. Leave generous frequency space for narration. Sophisticated, global, modern, premium, trustworthy and ambitious.`;

function findAudioBase64(value, depth = 0) {
  if (depth > 8 || !value) return null;
  if (typeof value !== "object") return null;
  if (typeof value.audio_base64 === "string" && value.audio_base64.trim()) {
    return value.audio_base64.trim();
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findAudioBase64(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const item of Object.values(value)) {
    const found = findAudioBase64(item, depth + 1);
    if (found) return found;
  }
  return null;
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function storeAudio(buffer, fileName, contentType) {
  const path = `33336a72-acb5-474e-856b-8be0269360e2/avantiqo-investor-video-20260818/${fileName}`;
  const { error } = await supabaseAdmin.storage
    .from("creative-assets")
    .upload(path, buffer, {
      contentType,
      upsert: true,
      cacheControl: "3600",
    });
  if (error) throw error;
  const { data } = supabaseAdmin.storage.from("creative-assets").getPublicUrl(path);
  return data?.publicUrl || null;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== ACCESS_TOKEN) {
      return json({ success: false, error: "Not found" }, 404);
    }

    const mode = url.searchParams.get("mode") || "voice";
    const action = url.searchParams.get("action") || "start";

    if (mode === "voice") {
      const words = NARRATION.split(/\s+/).filter(Boolean).length;
      const quantity = Math.max(0.02, words / 145);
      const execution = await ServiceExecutionRuntime.execute({
        organization_id: ORGANIZATION_ID,
        bill_to_organization_id: ORGANIZATION_ID,
        service_id: "ai.text.to.speech",
        input: {
          input: NARRATION,
          voice: "onyx",
          response_format: "mp3",
          quantity,
          instructions:
            "Premium cinematic technology narrator. Neutral international English. Natural, calm, intelligent and authoritative. Controlled energy, confident but not salesy. Use meaningful pauses after major ideas. Emphasize Avantiqo, shared operating context, vertical entry horizontal expansion, and intelligent enterprise. Never sound robotic or like a radio announcer.",
        },
        metadata: {
          module: "CREATIVE",
          operation: "AVANTIQO_INVESTOR_VIDEO_NARRATION",
          brand: "Avantiqo",
          source: "avantiqo_investor_video_render_20260818",
        },
        category: "AI",
      });

      const audioBase64 = findAudioBase64(execution);
      if (!audioBase64) {
        return json({ success: false, error: "No audio returned", execution }, 502);
      }
      const audio = Buffer.from(audioBase64, "base64");
      const audioUrl = await storeAudio(audio, "avantiqo-investor-narration.mp3", "audio/mpeg");
      return json({
        success: true,
        audio_url: audioUrl,
        bytes: audio.length,
        provider: execution.provider || null,
        model: execution.model || null,
        usage_id: execution.usage?.id || null,
        pricing: execution.pricing || null,
      });
    }

    if (mode === "music" && action === "start") {
      const execution = await ServiceExecutionRuntime.execute({
        organization_id: ORGANIZATION_ID,
        bill_to_organization_id: ORGANIZATION_ID,
        service_id: "ai.music.generate",
        input: {
          prompt: MUSIC_DIRECTION,
          instrumental: true,
          duration_seconds: 60,
          quantity: 60,
        },
        metadata: {
          module: "CREATIVE",
          operation: "AVANTIQO_INVESTOR_VIDEO_SCORE",
          brand: "Avantiqo",
          source: "avantiqo_investor_video_render_20260818",
        },
        category: "AI",
      });
      return json({ success: true, execution });
    }

    if (mode === "music" && action === "poll") {
      const provider = url.searchParams.get("provider");
      const providerJobId = url.searchParams.get("provider_job_id");
      const usageId = url.searchParams.get("usage_id");
      const credentialId = url.searchParams.get("credential_id") || null;
      if (!provider || !providerJobId || !usageId) {
        return json({ success: false, error: "provider, provider_job_id and usage_id required" }, 400);
      }
      const settlement = await ServiceExecutionRuntime.settle({
        organization_id: ORGANIZATION_ID,
        provider,
        provider_job_id: providerJobId,
        usage_id: usageId,
        credential_id: credentialId,
        metadata: {
          module: "CREATIVE",
          operation: "AVANTIQO_INVESTOR_VIDEO_SCORE_POLL",
          brand: "Avantiqo",
          source: "avantiqo_investor_video_render_20260818",
        },
      });
      return json({ success: true, settlement });
    }

    return json({ success: false, error: "Unsupported mode" }, 400);
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
