import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function savePayment({
  aggregate,
}) {
  const p = aggregate.state;

  const { data, error } =
    await supabaseAdmin
      .from("payments")
      .upsert({
        id: p.id,
        organization_id: p.organizationId,
        order_id: p.orderId,
        session_id: p.sessionId,
        amount: p.amount,
        payment_method: p.method,
        payment_reference: p.reference,
        status: p.status,
        paid_at: p.paidAt,
        created_at: p.createdAt,
        updated_at: p.updatedAt,
      })
      .select()
      .single();

  if (error) throw error;

  return data;
}
