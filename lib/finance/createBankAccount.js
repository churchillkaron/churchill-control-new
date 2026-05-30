import { supabase } from "@/lib/supabase";

export async function createBankAccount(data) {
  const { data: account, error } = await supabase
    .from("bank_accounts")
    .insert(data)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return account;
}
