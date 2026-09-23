export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { staffApiErrorResponse } from "@/lib/people/portal/StaffApiError";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

export async function POST(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request });
    if (!context.success) {
      return NextResponse.json({ success: false, error: context.error, code: context.code }, { status: context.status || 403 });
    }

    const memories = await supabaseAdmin.from("ai_staff_memory")
      .select("id,organization_id,staff_id,score,memory_type,memory_value,created_at")
      .eq("organization_id", context.organizationId)
      .eq("staff_id", context.staff.id)
      .order("score", { ascending: false })
      .limit(10);
    if (memories.error) throw memories.error;

    const memoryEvidence = (memories.data || []).map((memory) => ({
      type: String(memory.memory_type || "").slice(0, 80) || null,
      value: String(memory.memory_value || "").slice(0, 600) || null,
      score: Number(memory.score || 0),
      createdAt: memory.created_at || null,
    }));

    const execution = await ServiceExecutionRuntime.execute({
      organization_id: context.organizationId,
      service_id: "ai.text.generate",
      provider_id: "avantiqo-intelligence",
      input: {
        execution_lane:
          "fast",
        prompt: `You are Avantiqo Staff Intelligence.

Generate a concise staff feed for the authenticated employee only. Do not assume a restaurant, hotel, nightlife, healthcare, school, workshop, or any other industry unless the supplied evidence supports it.\n\nStaff: ${context.staff.name || "Staff"}\nRole: ${context.staff.role || context.role || "Staff"}\nRelevant memory evidence: ${JSON.stringify(memoryEvidence)}\n\nReturn a strict JSON array with at most 6 objects. Each object may contain only title, message and priority. Do not invent VIP, customer, payroll, schedule, safety or performance facts that are not present in the supplied evidence.`,
        max_output_tokens: 600,
      },
      metadata: {
        module: "STAFF_PORTAL",
        operation: "AI_FEED",
        staff_id: context.staff.id,
        local_first: true,
        authority_effect: "NONE",
      },
      category: "AI",
    });

    const raw = execution?.output?.text || execution?.output?.output?.text || "[]";
    let parsed = [];
    try { parsed = JSON.parse(raw); } catch { parsed = []; }
    const items = Array.isArray(parsed)
      ? parsed.slice(0, 6).map((item) => ({
          title: String(item?.title || "").trim().slice(0, 120) || "Update",
          message: String(item?.message || "").trim().slice(0, 600),
          priority: ["LOW", "NORMAL", "HIGH"].includes(String(item?.priority || "").trim().toUpperCase())
            ? String(item.priority).trim().toUpperCase()
            : "NORMAL",
        })).filter((item) => item.message)
      : [];

    return NextResponse.json({ success: true, items });
  } catch (error) {
    return staffApiErrorResponse(error, "Unable to load staff feed");
  }
}
