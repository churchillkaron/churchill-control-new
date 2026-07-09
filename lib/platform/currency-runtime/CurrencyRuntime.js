import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";


export async function getEntityCurrency({

  entityId,

}) {

  if (!entityId) {
    return null;
  }


  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from("legal_entities")
      .select(
        "currency"
      )
      .eq(
        "id",
        entityId
      )
      .single();


  if (error)
    throw error;


  return data?.currency || null;

}


export const CurrencyRuntime = {

  getEntityCurrency,

};
