import BaseLookupProvider from "../BaseLookupProvider";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const upper = (v) => String(v || "").trim().toUpperCase();

class JournalLookup extends BaseLookupProvider {
  async getOptions({ context } = {}) {
    if (!context?.organizationId) throw new Error("organizationId required");
    if (!context?.entityId) return [];
    const { data, error } = await supabaseAdmin
      .from("journal_entries")
      .select("id,journal_number,reference,posting_date,description,status,reversed,reversal_status")
      .eq("organization_id", context.organizationId)
      .eq("entity_id", context.entityId)
      .order("posting_date", { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data || [])
      .filter((row) => upper(row.status) === "POSTED" && row.reversed !== true && !["PENDING", "REVERSED"].includes(upper(row.reversal_status)))
      .map((row) => ({
        value: row.id,
        label: row.journal_number || row.reference || row.id,
        description: [row.posting_date, row.description].filter(Boolean).join(" · "),
        raw: row,
      }));
  }
}

export default new JournalLookup();
