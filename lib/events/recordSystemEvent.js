import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { runEventProcessors } from "@/lib/workers/system/runEventProcessors";

export async function recordSystemEvent({
  organizationId,
  type,
  payload = {},
  idempotencyKey = null,
}) {
  if (!type) {
    return { success: false, error: "type required" };
  }

  // 🛑 IDENTITY GUARD (PREVENT DUPLICATES)
  if (idempotencyKey) {
    const { data: existing } = await supabaseAdmin
      .from("system_events")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .single();

    if (existing) {
      return {
        success: true,
        skipped: true,
        reason: "duplicate_event"
      };
    }
  }

  const { data, error } = await supabaseAdmin
    .from("system_events")
    .insert({
      organization_id: organizationId || null,
      type,
      payload,
      idempotency_key: idempotencyKey,
    })
    .select()
    .single();

  if (error) {
    console.error("[SYSTEM_EVENT_ERROR]", error.message);
    return { success: false, error: error.message };
  }

  try {
    await runEventProcessors();
  } catch (err) {
    console.error("[EVENT_PROCESS_ERROR]", err.message);
  }

  return {
    success: true,
    event: data,
  };
}
