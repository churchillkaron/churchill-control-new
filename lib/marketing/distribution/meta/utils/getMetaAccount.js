import { supabase }
from "@/lib/supabase";

export async function getMetaAccount() {

  try {

    const {
      data,
      error,
    } = await supabase
      .from("meta_accounts")
      .select("*")
      .eq("connected", true)
      .single();

    if (error) {

      return {
        success: false,
        error,
      };

    }

    return {
      success: true,
      data,
    };

  } catch (error) {

    return {
      success: false,
      error: error.message,
    };

  }

}