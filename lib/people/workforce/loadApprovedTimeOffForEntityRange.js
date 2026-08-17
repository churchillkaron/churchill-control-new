import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function loadApprovedTimeOffForEntityRange({
  organizationId,
  entityId,
  staffId,
  startDate,
  endDate,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!entityId) throw new Error("entityId required");
  if (!staffId) throw new Error("staffId required");
  if (!startDate || !endDate) throw new Error("startDate and endDate required");

  const { data, error } = await supabaseAdmin
    .from("staff_time_off_requests")
    .select(
      "id,organization_id,entity_id,staff_id,party_id,leave_type,attendance_classification,start_date,end_date,status,reviewed_at,updated_at,created_at"
    )
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("staff_id", staffId)
    .eq("status", "APPROVED")
    .lte("start_date", endDate)
    .gte("end_date", startDate)
    .order("start_date", { ascending: true });

  if (error) throw error;
  return data || [];
}
