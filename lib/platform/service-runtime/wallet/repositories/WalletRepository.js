import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

const WALLET_TABLE = "organization_wallets";
const TRANSACTION_TABLE = "wallet_transactions";

export const WalletRepository = {
  async getByOrganization(organizationId) {
    const { data, error } = await supabaseAdmin
      .from(WALLET_TABLE)
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async applyTransaction({
    organization_id,
    operation,
    amount = 0,
    currency = null,
    provider = null,
    usage_id = null,
    invoice_id = null,
    reference = null,
    idempotency_key = null,
    metadata = {},
  }) {
    const { data, error } = await supabaseAdmin.rpc(
      "apply_wallet_transaction",
      {
        p_organization_id: organization_id,
        p_operation: operation,
        p_amount: Number(amount || 0),
        p_currency: currency,
        p_provider: provider,
        p_usage_id: usage_id,
        p_invoice_id: invoice_id,
        p_reference: reference,
        p_idempotency_key: idempotency_key,
        p_metadata: metadata || {},
      },
    );

    if (error) throw error;
    return data;
  },

  async findTransaction({
    organization_id,
    idempotency_key = null,
    type = null,
    usage_id = null,
    reference = null,
  }) {
    let query = supabaseAdmin
      .from(TRANSACTION_TABLE)
      .select("*")
      .eq("organization_id", organization_id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (idempotency_key) query = query.eq("idempotency_key", idempotency_key);
    if (type) query = query.eq("type", type);
    if (usage_id) query = query.eq("usage_id", usage_id);
    if (reference) query = query.eq("reference", reference);

    if (!idempotency_key && !type && !usage_id && !reference) return null;

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data || null;
  },

  async transactions(organizationId) {
    const { data, error } = await supabaseAdmin
      .from(TRANSACTION_TABLE)
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  },
};
