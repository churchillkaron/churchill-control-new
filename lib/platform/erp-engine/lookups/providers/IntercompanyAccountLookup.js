import BaseLookupProvider from "../BaseLookupProvider";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

class IntercompanyAccountLookup extends BaseLookupProvider {
  async getOptions({ context }) {
    if (!context?.organizationId) return [];

    const [{ data: accounts, error: accountError }, { data: entities, error: entityError }] =
      await Promise.all([
        supabaseAdmin
          .from("chart_of_accounts")
          .select("*")
          .eq("organization_id", context.organizationId)
          .order("account_code", { ascending: true }),
        supabaseAdmin
          .from("legal_entities")
          .select("id, code, legal_name, display_name, is_active")
          .eq("organization_id", context.organizationId),
      ]);

    if (accountError) throw accountError;
    if (entityError) throw entityError;

    const entityById = new Map(
      (entities || []).map((entity) => [String(entity.id), entity])
    );

    return (accounts || [])
      .filter((account) => account.is_active !== false)
      .map((account) => {
        const entity = entityById.get(String(account.entity_id || ""));
        const entityLabel =
          entity?.code || entity?.display_name || entity?.legal_name || "Unassigned Entity";

        return {
          value: account.id,
          label: `${entityLabel} · ${account.account_code} - ${account.account_name}`,
          code: account.account_code || "",
          description: `${entityLabel} · ${account.account_type || account.account_category || "Account"}`,
          raw: { ...account, legal_entity: entity || null },
        };
      });
  }
}

export default new IntercompanyAccountLookup();
