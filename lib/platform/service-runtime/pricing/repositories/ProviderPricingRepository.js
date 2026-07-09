import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";


export async function listProviderPricing({

  provider,

  capability = null,

  country = null,

  currency = null,

}) {


  let query =
    supabaseAdmin
      .from("provider_pricing")
      .select("*")
      .eq(
        "provider",
        provider
      )
      .eq(
        "active",
        true
      );



  if (capability) {

    query =
      query.eq(
        "capability",
        capability
      );

  }



  if (country) {

    query =
      query.or(
        `country.eq.${country},country.eq.*`
      );

  }



  if (currency) {

    query =
      query.or(
        `currency.eq.${currency},currency.is.null`
      );

  }



  const {
    data,
    error,
  } =
    await query
      .order(
        "created_at",
        {
          ascending:false,
        }
      );



  if (error) {

    throw new Error(
      error.message
    );

  }



  return data || [];

}



export async function getProviderPricing({

  provider,

  capability = null,

  model = null,

  country = null,

  currency = null,

}) {


  const rows =
    await listProviderPricing({

      provider,

      capability,

      country,

      currency,

    });



  return (
    rows.find(row => {

      if (
        model &&
        row.model !== model
      ) {
        return false;
      }


      return true;

    })
    ||
    null
  );

}



export const ProviderPricingRepository = {

  listProviderPricing,

  getProviderPricing,

};
