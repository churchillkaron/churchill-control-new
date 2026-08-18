export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import "@/lib/finance/bootstrap/registerFinanceBilling";
import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const TOKEN = "avq-cedar-20260818-voice";
const PATH = "33336a72-acb5-474e-856b-8be0269360e2/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar.mp3";

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

Avantiqo is building toward a future where the business does not have to explain itself to every new piece of software.

The system already understands the company.

Avantiqo. One operating system for the intelligent enterprise.

Created with Avantiqo.`;

function findAudioBase64(value, depth = 0) {
  if (depth > 8 || !value || typeof value !== "object") return null;
  if (typeof value.audio_base64 === "string" && value.audio_base64.trim()) return value.audio_base64.trim();
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

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return Response.json({ success: false }, { status: 404 });

    const words = NARRATION.split(/\s+/).filter(Boolean).length;
    const execution = await ServiceExecutionRuntime.execute({
      organization_id: ORGANIZATION_ID,
      bill_to_organization_id: ORGANIZATION_ID,
      service_id: "ai.text.to.speech",
      input: {
        input: NARRATION,
        voice: "cedar",
        response_format: "mp3",
        quantity: Math.max(0.02, words / 142),
        instructions: "World-class premium technology documentary narration. Neutral international English. Warm, natural, intelligent and assured. Sophisticated and cinematic, never theatrical, robotic, salesy or announcer-like. Medium-low energy with calm authority. Use subtle emotional lift on the Avantiqo vision. Speak at a measured 142 words per minute with natural pauses between sections. Pronounce Avantiqo as ah-VAN-tee-koh. Give extra clarity to AI-native Business Operating System, shared operating context, vertical entry horizontal expansion, and intelligent enterprise.",
      },
      metadata: {
        module: "CREATIVE",
        operation: "AVANTIQO_INVESTOR_VIDEO_NARRATION_CEDAR",
        brand: "Avantiqo",
        source: "avantiqo_investor_video_20260818",
      },
      category: "AI",
    });

    const base64 = findAudioBase64(execution);
    if (!base64) return Response.json({ success: false, error: "No audio returned" }, { status: 502 });
    const bytes = Buffer.from(base64, "base64");

    const { error } = await supabaseAdmin.storage.from("creative-assets").upload(PATH, bytes, {
      contentType: "audio/mpeg",
      upsert: true,
      cacheControl: "3600",
    });
    if (error) throw error;

    const { data: signed, error: signedError } = await supabaseAdmin.storage
      .from("creative-assets")
      .createSignedUrl(PATH, 3600);
    if (signedError) throw signedError;

    return Response.json({
      success: true,
      voice: "cedar",
      provider: execution.provider || null,
      model: execution.model || null,
      usage_id: execution.usage?.id || null,
      pricing: execution.pricing || null,
      audio_url: signed?.signedUrl || null,
      bytes: bytes.length,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}
