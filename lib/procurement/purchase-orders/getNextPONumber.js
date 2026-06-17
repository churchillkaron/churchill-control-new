import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function getNextPONumber({ tenantId }) {
  const { data, error } = await supabaseAdmin
    .from("purchase_orders")
    .select("po_number")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const lastNumber = data?.po_number?.match(/\d+$/)?.[0] || "0";
  const nextNumber = String(Number(lastNumber) + 1).padStart(6, "0");
  return `PO-${nextNumber}`;
}
