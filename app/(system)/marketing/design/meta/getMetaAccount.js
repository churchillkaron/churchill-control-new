import { supabase }
from "@/lib/supabase";

export async function getMetaAccount(
  tenantId
) {

  const { data, error } =
    await supabase
      .from("meta_accounts")
      .select("*")
      .eq(
        "tenant_id",
        tenantId
      )
      .single();

  if (error) {

    throw error;
  }

  return data;
}