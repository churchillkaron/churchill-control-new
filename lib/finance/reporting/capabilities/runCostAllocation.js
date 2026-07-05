import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function runCostAllocation({
  organizationId,
}) {
  const allocations = [
    {
      organization_id: organizationId,
      allocation_type: "shared_services",
      source_department: "HQ",
      target_department: "Restaurant",
      allocation_amount: 125000,
    },
    {
      organization_id: organizationId,
      allocation_type: "marketing",
      source_department: "Marketing",
      target_department: "Beach Club",
      allocation_amount: 84000,
    },
  ];

  const { data, error } = await supabaseAdmin
    .from("cost_allocations")
    .insert(allocations)
    .select();

  if (error) {
    throw error;
  }

  return data;
}
