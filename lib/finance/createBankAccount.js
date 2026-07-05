import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function createBankAccount(data) {
  const { data: account, error } = await supabaseAdmin
    .from("bank_accounts")
    .insert(data)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return account;
}
