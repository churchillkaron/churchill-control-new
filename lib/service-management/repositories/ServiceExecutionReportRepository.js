import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function throwResultError(result, fallback) {
  if (!result?.error) return result;
  const error = new Error(result.error.message || fallback);
  error.code = result.error.code;
  throw error;
}

export async function getExecutionReport({ organizationId, workOrderId }) {
  const result = await supabaseAdmin
    .from("service_execution_reports")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("work_order_id", workOrderId)
    .maybeSingle();

  throwResultError(result, "Unable to load service execution report.");
  return result.data || null;
}

export async function insertExecutionReport({ values }) {
  const result = await supabaseAdmin
    .from("service_execution_reports")
    .insert(values)
    .select("*")
    .single();

  throwResultError(result, "Unable to create service execution report.");
  return result.data;
}

export async function updateExecutionReport({
  organizationId,
  workOrderId,
  staffId,
  values,
}) {
  const result = await supabaseAdmin
    .from("service_execution_reports")
    .update({
      ...values,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("work_order_id", workOrderId)
    .eq("staff_id", staffId)
    .select("*")
    .single();

  throwResultError(result, "Unable to update service execution report.");
  return result.data;
}

export default Object.freeze({
  getExecutionReport,
  insertExecutionReport,
  updateExecutionReport,
});
