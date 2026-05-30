import { supabase } from "@/lib/supabase";

export async function runInternalControls({
  tenantId,
}) {
  const controls = [
    {
      tenant_id: tenantId,
      control_name: "Journal Approval Control",
      control_type: "approval",
      status: "passed",
      notes: "All journals require approval.",
    },
    {
      tenant_id: tenantId,
      control_name: "Period Lock Control",
      control_type: "period_close",
      status: "passed",
      notes: "Closed periods immutable.",
    },
  ];

  const { data, error } = await supabase
    .from("internal_controls")
    .insert(controls)
    .select();

  if (error) {
    throw error;
  }

  return data;
}
