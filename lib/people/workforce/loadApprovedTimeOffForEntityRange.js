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
      "