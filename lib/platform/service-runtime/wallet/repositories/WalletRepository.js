import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

const WALLET_TABLE =
  "organization_wallets";

const TRANSACTION_TABLE =
  "wallet_transactions";

export const WalletRepository = {

  async getByOrganization(
    organizationId
  ) {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(WALLET_TABLE)
      .select("*")
      .eq(
        "organization_id",
        organizationId
      )
      .maybeSingle();

    if (error)
      throw error;

    return data;

  },

  async create(
    wallet
  ) {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(WALLET_TABLE)
      .insert(wallet)
      .select()
      .single();

    if (error)
      throw error;

    return data;

  },

  async update(
    walletId,
    updates
  ) {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(WALLET_TABLE)
      .update({
        ...updates,
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", walletId)
      .select()
      .single();

    if (error)
      throw error;

    return data;

  },

  async addTransaction(
    transaction
  ) {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(TRANSACTION_TABLE)
      .insert(transaction)
      .select()
      .single();

    if (error)
      throw error;

    return data;

  },

  async transactions(
    organizationId
  ) {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(TRANSACTION_TABLE)
      .select("*")
      .eq(
        "organization_id",
        organizationId
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (error)
      throw error;

    return data || [];

  },

};
