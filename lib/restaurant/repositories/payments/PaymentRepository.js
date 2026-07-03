import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function loadPayment({
  organizationId,
  paymentId,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!paymentId) {
    throw new Error("paymentId required");
  }

  const { data, error } =
    await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", paymentId)
      .single();

  if (error) throw error;

  return data;
}

export async function savePayment({
  aggregate,
}) {
  const p = aggregate.state;

  const { data, error } =
    await supabaseAdmin
      .from("payments")
      .upsert({
        id: p.id,
        organization_id: p.organizationId || p.organization_id,
        order_id: p.orderId || p.order_id || null,
        session_id: p.sessionId || p.session_id || null,
        amount: Number(p.amount || 0),
        payment_method: p.method || p.payment_method || "CASH",
        payment_reference: p.reference || p.payment_reference || null,
        status: p.status || "PENDING",
        paid_at: p.paidAt || p.paid_at || null,
        created_at: p.createdAt || p.created_at || new Date().toISOString(),
        updated_at: p.updatedAt || p.updated_at || new Date().toISOString(),
      })
      .select()
      .single();

  if (error) throw error;

  return data;
}
