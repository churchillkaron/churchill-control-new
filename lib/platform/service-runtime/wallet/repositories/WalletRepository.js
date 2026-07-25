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

  async create(wallet) {
    const { data, error } = await supabaseAdmin
      .from(WALLET_TABLE)
      .insert(wallet)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(walletId, updates) {
    const { data, error } = await supabaseAdmin
      .from(WALLET_TABLE)
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", walletId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async findTransaction({
    organization_id,
    type,
    usage_id = null,
    reference = null,
  }) {
    let query = supabaseAdmin
      .from(TRANSACTION_TABLE)
      .select("*")
      .eq("organization_id", organization_id)
      .eq("type", type)
      .order("created_at", { ascending: false })
      .limit(1);

    if (usage_id) query = query.eq("usage_id", usage_id);
    if (reference) query = query.eq("reference", reference);

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data || null;
  },

  async addTransaction(transaction) {
    const existing = await this.findTransaction({
      organization_id: transaction.organization_id,
      type: transaction.type,
      usage_id: transaction.usage_id || null,
      reference: transaction.reference || null,
    });

    if (existing) return existing;

    const { data, error } = await supabaseAdmin
      .from(TRANSACTION_TABLE)
      .insert(transaction)
      .select()
      .single();

    if (error) throw error;
    return data;
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
