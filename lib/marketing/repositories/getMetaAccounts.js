import { getServiceSupabase }
from "@/lib/shared/supabase/service";

const supabase =
  getServiceSupabase();

export async function getMetaAccounts({

  organizationId,

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
        "organization_id",
        organizationId
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
