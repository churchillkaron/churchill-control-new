import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function settleIntercompanyTransaction({
  organization_id,
  transaction_id,
  settled_by = "system",
}) {
  const {
    data: transaction,
    error: loadError,
  } = await supabaseAdmin
    .from("intercompany_transactions")
    .select("*")
    .eq("organization_id", organization_id)
    .eq("id", transaction_id)
    .single();

  if (loadError || !transaction) {
    throw new Error("TRANSACTION_NOT_FOUND");
  }

  if (transaction.status === "settled") {
    throw new Error("TRANSACTION_ALREADY_SETTLED");
  }

  const {
    data,
    error,
  } = await supabaseAdmin
    .from("intercompany_transactions")
    .update({
      status: "settled",
      settled_at: new Date().toISOString(),
      settled_by,
      updated_at: new Date().toISOString(),
    })
    .eq("id", transaction.id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  await supabaseAdmin
    .from("audit_logs")
    .insert([{
      organization_id,
      action: "INTERCOMPANY_SETTLED",
      entity_type: "intercompany_transaction",
      entity_id: transaction.id,
      metadata: {
        reference_number: transaction.reference_number,
        settled_by,
      },
    }]);

  return {
    success: true,
    transaction: data,
  };
}
