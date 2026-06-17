import { supabase }
from "@/lib/shared/supabase/client";

export async function getMetaAccounts({

  tenantId,

}) {

  try {

    const {
      data,
      error,
    } = await supabase
      .from(
        "meta_accounts"
      )
      .select("*")
      .eq(
        "tenant_id",
        tenantId
      )
      .order(
        "page_name",
        {
          ascending: true,
        }
      );

    if (error) {

      throw error;

    }

    return data || [];

  } catch (err) {

    console.error(
      "GET META ACCOUNTS ERROR:",
      err
    );

    return [];

  }

}
