export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import "@/lib/finance/bootstrap/registerFinanceBilling";
import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const TOKEN = "avq-cedar-v2-20260818";
const PATH = "33336a72-acb5-474e-856b-8be0269360e2/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar-v2.mp3";

const NARRATION = `Businesses have software for every department. But most companies still do not have software that understands the whole business.

Avantiqo is an AI-native Business Operating System designed to bring the company into one shared operating context.

Instead of finance living in one system, operations in another, customers somewhere else, and AI sitting on top as a disconnected chatbot, Avantiqo connects the core business domains so information, decisions and execution can work together.

At the center is the organization itself. Avantiqo understands companies, workspaces, users, permissions, entities and operating context. That shared context is what allows every workspace to become part of one system rather than another isolated application.

Start with growth. A customer review, a campaign and the result of that campaign should not live in separate tools. Avantiqo can connect the customer interaction, prepare the response, manage campaigns, measure what happens next, and use the same business context to improve the next decision.

Communications becomes one operating layer for the conversations around the business. Customer interactions can stay connected to the customer, the quotation, the booking, the task, the service or the follow-up that comes next.

Then the same context reaches daily operations. In a restaurant, orders, tables, kitchen execution, bar service and payments can live inside the same platform architecture. The point is not one vertical. The point is that Avantiqo can enter through a painful real-world workflow, solve it deeply, and then expand across the company.

The same operating core can be expressed differently for different industries. Hotel teams can coordinate front office and property operations. Healthcare operations can coordinate appointments, admissions, beds, pharmacy and controlled records. Field-service businesses can connect appointments, dispatch, technicians, service execution and completion evidence.

Procurement, receiving and inventory connect the physical flow of the business to the same system. And that matters because operations should not have to be reconstructed later in accounting.

A sale made through Avantiqo POS can become part of the financial record. A supplier invoice can be captured into a controlled finance workflow. Purchasing, receiving, customer invoices, journals and the general ledger can operate from connected business context rather than separate copies of the truth.

People, scheduling, attendance and payroll are connected too. Compliance, projects and administration stay inside the same operating structure, with the right permissions and accountability around the work.

Different participants can have different doors into the same business. Customers, staff, suppliers and management do not need the same interface, but they can still interact with the same operating system and the same underlying truth.

Integrations extend Avantiqo outward to websites, communication channels, commerce and external services while the organization remains the source of operating context.

This is already a working product, built from problems experienced while operating real businesses. The platform is multi-company and cross-industry by design, with the long-term goal of giving companies one intelligent operating layer instead of a growing collection of disconnected software.

The opportunity is larger than replacing individual applications. As AI moves from answering questions to coordinating work, it needs reliable company context, permissions, workflows and accountability.

When customers, operations, money, people, suppliers and communications share that context, AI no longer sees fragments of the business. It can begin to understand the business itself.

Our go-to-market strategy is vertical entry, horizontal expansion: solve a painful workflow first, prove value, then expand into more of the organization through the same platform.

Avantiqo is building toward a future where the business does not have to explain itself to every new piece of software.

The system already understands the company.

Avantiqo. One operating system for the intelligent enterprise.`;

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
        quantity: Math.max(0.02, words / 134),
        instructions: "Premium investor-film documentary narration. Neutral international English. Warm, intelligent, assured, sophisticated and cinematic. Never theatrical, salesy or announcer-like. Speak slower than the previous version, about 134 words per minute, with clear pauses between business stories. Pronounce Avantiqo as ah-VAN-tee-koh. Give extra clarity to AI-native Business Operating System, customer reviews, campaigns, communications, restaurant operations, healthcare operations, field service, procurement, finance, portals, integrations, vertical entry horizontal expansion, and intelligent enterprise.",
      },
      metadata: {
        module: "CREATIVE",
        operation: "AVANTIQO_INVESTOR_VIDEO_NARRATION_CEDAR_V2",
        brand: "Avantiqo",
        source: "avantiqo_investor_video_20260818_v2",
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
      audio_url: signed?.signedUrl || null,
      bytes: bytes.length,
      words,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}
