import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function getAuditTrail({
  tenantId,
  startDate,
  endDate,
}) {
  let query = supabase
    .from("immutable_audit_chain")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", {
      ascending: false,
    });

  if (startDate) {
    query = query.gte(
      "created_at",
      startDate
    );
  }

  if (endDate) {
    query = query.lte(
      "created_at",
      endDate
    );
  }

  const { data, error } =
    await query;

  if (error) {
    throw error;
  }

  return data;
}
