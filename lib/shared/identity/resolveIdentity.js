import { supabase } from "@/lib/shared/supabase/client";

/**
 * SINGLE SOURCE OF TRUTH FOR IDENTITY
 */

export async function resolveIdentity({ userEmail }) {
  if (!userEmail) {
    throw new Error(
      "Missing userEmail for identity resolution"
    );
  }

  const { data: staff, error } =
    await supabase
      .from("organization_users")
      .select("*")
      .eq("email", userEmail)
      .single();

  if (error || !staff) {
    throw new Error(
      "Staff not found for identity resolution"
    );
  }

  return {
    staff_id: staff.id,
    organization_id:
      staff.organization_id,
    entity_id:
      staff.entity_id || null,
    period_id:
      staff.period_id || null,
  };
}
