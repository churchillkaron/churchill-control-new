import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CLOSED_SESSION_STATUSES = [
  "CLOSED",
  "COMPLETED",
  "CANCELLED",
];

export async function repository({ context, payload }) {
  const organizationId =
    context?.organizationId ||
    context?.organization_id ||
    null;

  if (!organizationId) {
    throw new Error("organizationId required");
  }

  let sessionId = payload.sessionId || null;

  if (!sessionId && payload.tableId) {
    const sessionResult = await supabaseAdmin
      .from("table_sessions")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("table_id", payload.tableId)
      .not("status", "in", `(${CLOSED_SESSION_STATUSES.join(",")})`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessionResult.error) {
      throw sessionResult.error;
    }

    sessionId = sessionResult.data?.id || null;
  }

  if (!sessionId) {
    throw new Error("Active restaurant session not found");
  }

  const result = await supabaseAdmin
    .from("table_sessions")
    .update({
      party_id: payload.partyId || null,
      customer_name: payload.customerName || null,
      customer_email: payload.customerEmail || null,
      customer_phone: payload.customerPhone || null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("id", sessionId)
    .select("*")
    .maybeSingle();

  if (result.error) {
    throw result.error;
  }

  if (!result.data) {
    throw new Error("Restaurant session customer was not updated");
  }

  return {
    success: true,
    session: result.data,
    sessionId: result.data.id,
    partyId: result.data.party_id || null,
    customerName: result.data.customer_name || null,
  };
}
