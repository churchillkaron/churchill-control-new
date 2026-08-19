export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import "@/lib/finance/bootstrap/registerFinanceBilling";
import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const TOKEN = "avq-cedar-v4-founder-4min-20260819";
const PATH = "33336a72-acb5-474e-856b-8be0269360e2/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar-v4-founder-4min.mp3";
const SPEED = 0.89;

const NARRATION = `I didn’t build Avantiqo because I wanted to create another software company.

I built it because running real businesses showed me the same problem again and again.

Finance knew one part of the business. Operations knew another. Customers, staff, suppliers and marketing all lived in different systems. Whenever I wanted to understand what was really happening, I had to put the company back together in my head.

That made one thing obvious.

The business should not have to explain itself to its software. The software should understand the business.

That is why I built Avantiqo.

Avantiqo is an AI-native Business Operating System designed to bring the company into one shared operating context.

Instead of finance living in one system, operations in another, customers somewhere else, and AI sitting on top as a disconnected chatbot, Avantiqo connects the business so information, decisions and execution can work together.

At the center is the organization itself: its people, entities, permissions, customers, suppliers, history and operating context. That shared context turns separate workspaces into one system.

And that changes what software can do.

A customer interaction should not end inside a messaging tool. A campaign should not be disconnected from the customer or the result it creates. A quotation, booking, task, service and follow-up should stay connected to the same business reality.

Avantiqo can understand what is happening, identify what needs attention, recommend the next action, ask for approval when required, and then execute.

Understand. Recommend. Approve. Execute.

The point is not one vertical.

Avantiqo can enter through a painful real-world workflow, solve it deeply, and then expand across the company.

The same operating core can work differently for different industries. Restaurants can connect orders, kitchen execution, service and payments. Hotels can coordinate front office and property operations. Healthcare can coordinate appointments, beds, pharmacy and controlled records. Field-service businesses can connect dispatch, technicians and completion evidence.

Different industries. Different workflows. One operating architecture.

And the important part is what happens between them.

A sale can become part of the financial record. Purchasing can connect to receiving and inventory. Supplier invoices can enter controlled finance workflows. People, scheduling, payroll and compliance can stay inside the same operating structure, with the right permissions and accountability.

Customers, staff, suppliers and management do not need the same interface, but they can still interact with the same operating system and the same underlying truth.

Integrations extend Avantiqo outward to websites, communication channels, commerce and external services while the organization remains the source of operating context.

This becomes even more important as AI moves from answering questions to coordinating real work.

AI cannot run a business responsibly without context, permissions, workflows and accountability. But when customers, operations, money, people, suppliers and communications share the same context, AI no longer sees fragments.

It can begin to understand the business itself.

Avantiqo is already a working product, built from problems I experienced while operating real businesses. The platform is multi-company and cross-industry by design.

Our strategy is simple: vertical entry, horizontal expansion. Solve a painful workflow first. Prove the value. Then expand through the same platform.

We are not building another business application.

We are building the system businesses will operate through.

Avantiqo.

One operating system for the intelligent enterprise.`;

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
        speed: SPEED,
        quantity: Math.max(0.02, words / 124),
        instructions: "Single continuous founder performance for a world-class investor film. Neutral international English. Warm, intelligent, experienced, calm, assured and cinematic. This is the founder personally telling his own story from beginning to end, never a detached narrator, announcer or salesperson. Keep the delivery measured and premium, with natural pauses after the personal opening statements and before major thesis lines. Give emotional emphasis without melodrama to: the software should understand the business; that is why I built Avantiqo; understand recommend approve execute; one operating architecture; it can begin to understand the business itself; and we are building the system businesses will operate through. Pronounce Avantiqo as ah-VAN-tee-koh. Maintain one consistent voice, room tone, energy and microphone perspective for the entire recording so sections can be used both as voice-over and exact founder lip-sync source.",
      },
      metadata: {
        module: "CREATIVE",
        operation: "AVANTIQO_INVESTOR_VIDEO_NARRATION_CEDAR_V4_FOUNDER_4MIN",
        brand: "Avantiqo",
        source: "avantiqo_investor_video_20260819_founder_master_v4",
        target_film_duration_seconds: 240,
        target_narration_duration_seconds: 229.5,
        speech_speed: SPEED,
        speaker_policy: "ONE_FOUNDER_VOICE_ENTIRE_FILM",
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

    const { data: signed, error: signedError } = await supabaseAdmin.storage.from("creative-assets").createSignedUrl(PATH, 86400);
    if (signedError) throw signedError;

    return Response.json({
      success: true,
      voice: "cedar",
      speech_speed: SPEED,
      speaker_policy: "ONE_FOUNDER_VOICE_ENTIRE_FILM",
      target_film_duration_seconds: 240,
      target_narration_duration_seconds: 229.5,
      audio_url: signed?.signedUrl || null,
      storage_path: PATH,
      bytes: bytes.length,
      words,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}
