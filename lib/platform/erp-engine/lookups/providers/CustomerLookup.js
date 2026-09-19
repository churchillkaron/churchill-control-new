import BaseLookupProvider from "../BaseLookupProvider";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const inactive = new Set(["INACTIVE","DISABLED","SUSPENDED","ARCHIVED","CLOSED"]);

class CustomerLookup extends BaseLookupProvider {
  async getOptions({ context } = {}) {
    if (!context?.organizationId) throw new Error("organizationId required");
    const { data: profiles, error } = await supabaseAdmin
      .from("customer_profiles")
      .select("party_id,customer_number,customer_type,status,preferred_currency,payment_terms")
      .eq("organization_id", context.organizationId)
      .order("customer_number", { ascending: true });
    if (error) throw error;
    const active = (profiles || []).filter((row) => !inactive.has(String(row.status || "ACTIVE").trim().toUpperCase()));
    const partyIds = active.map((row) => row.party_id).filter(Boolean);
    if (!partyIds.length) return [];
    const { data: parties, error: partyError } = await supabaseAdmin
      .from("parties")
      .select("id,display_name,legal_name,email,phone,tax_id")
      .eq("organization_id", context.organizationId)
      .in("id", partyIds);
    if (partyError) throw partyError;
    const partyById = new Map((parties || []).map((row) => [String(row.id), row]));
    return active.map((profile) => {
      const party = partyById.get(String(profile.party_id));
      if (!party) return null;
      const label = party.display_name || party.legal_name || profile.customer_number || party.id;
      return {
        value: party.id,
        label,
        description: [profile.customer_number, party.email, party.phone].filter(Boolean).join(" · "),
        raw: { ...profile, party },
      };
    }).filter(Boolean);
  }
}

export default new CustomerLookup();
