import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function createCustomer(data) {
  const { data: customer, error } = await supabaseAdmin
    .from("customers")
    .insert(data)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return customer;
}
