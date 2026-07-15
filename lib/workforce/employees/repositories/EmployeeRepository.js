import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function requireOrganizationId(organizationId) {
  if (!organizationId) throw new Error("organizationId required");
}

export const EmployeeRepository = {
  async list({ organizationId }) {
    requireOrganizationId(organizationId);

    const { data, error } = await supabaseAdmin
      .from("staff_accounts")
      .select("*")
      .eq("organization_id", organizationId)
      .order("full_name", { ascending: true });

    if (error) throw error;

    return data || [];
  },

  async get({ organizationId, employeeId }) {
    requireOrganizationId(organizationId);
    if (!employeeId) throw new Error("employeeId required");

    const { data, error } = await supabaseAdmin
      .from("staff_accounts")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", employeeId)
      .maybeSingle();

    if (error) throw error;

    return data || null;
  },
};
