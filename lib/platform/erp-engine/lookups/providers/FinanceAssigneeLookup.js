import BaseLookupProvider from "../BaseLookupProvider";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

class FinanceAssigneeLookup extends BaseLookupProvider {
  async getOptions({ context } = {}) {
    const organizationId = context?.organizationId;

    if (!organizationId) {
      throw new Error("organizationId required");
    }

    const { data: memberships, error: membershipError } = await supabaseAdmin
      .from("organization_users")
      .select("staff_account_id, status, active, is_active")
      .eq("organization_id", organizationId);

    if (membershipError) throw membershipError;

    const staffIds = (memberships || [])
      .filter((membership) => {
        const status = String(membership.status || "ACTIVE").toUpperCase();
        return (
          membership.staff_account_id &&
          membership.active !== false &&
          membership.is_active !== false &&
          !["INACTIVE", "DISABLED", "SUSPENDED", "ARCHIVED", "REVOKED"].includes(status)
        );
      })
      .map((membership) => membership.staff_account_id);

    let staffQuery = supabaseAdmin
      .from("staff_accounts")
      .select("id, auth_user_id, name, email, role, position, department, active, party_id")
      .eq("active", true)
      .not("auth_user_id", "is", null);

    if (staffIds.length) {
      staffQuery = staffQuery.in("id", staffIds);
    } else {
      staffQuery = staffQuery.eq("active_organization_id", organizationId);
    }

    const { data: staff, error: staffError } = await staffQuery.order("name", {
      ascending: true,
    });

    if (staffError) throw staffError;

    const partyIds = (staff || []).map((row) => row.party_id).filter(Boolean);
    let parties = [];

    if (partyIds.length) {
      const { data, error } = await supabaseAdmin
        .from("parties")
        .select("id, display_name, email")
        .in("id", partyIds);

      if (error) throw error;
      parties = data || [];
    }

    const partyById = new Map(parties.map((party) => [String(party.id), party]));

    return (staff || []).map((row) => {
      const party = partyById.get(String(row.party_id)) || null;
      const label = party?.display_name || row.name || row.email || "Unnamed Staff Member";
      const description = [
        row.position || row.role,
        row.department,
        party?.email || row.email,
      ]
        .filter(Boolean)
        .join(" · ");

      return {
        value: row.auth_user_id,
        label,
        description,
        raw: row,
      };
    });
  }
}

export default new FinanceAssigneeLookup();
