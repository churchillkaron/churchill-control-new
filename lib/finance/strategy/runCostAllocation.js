import { supabase } from "@/lib/supabase";

export async function runCostAllocation({
  tenantId,
}) {
  const allocations = [
    {
      tenant_id: tenantId,
      allocation_type: "shared_services",
      source_department: "HQ",
      target_department: "Restaurant",
      allocation_amount: 125000,
    },
    {
      tenant_id: tenantId,
      allocation_type: "marketing",
      source_department: "Marketing",
      target_department: "Beach Club",
      allocation_amount: 84000,
    },
  ];

  const { data, error } = await supabase
    .from("cost_allocations")
    .insert(allocations)
    .select();

  if (error) {
    throw error;
  }

  return data;
}
