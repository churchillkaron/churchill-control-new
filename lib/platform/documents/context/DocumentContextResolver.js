import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import {
  resolveBrand,
} from "../branding/BrandResolver";


export async function resolveDocumentContext({

  documentType,

  organizationId,

  entityId,

  data = {},

}) {


  let context = {

    documentType,

    data,

    organization:null,

    party:null,

    brand:null,

  };


  context.brand =
    await resolveBrand({

      organizationId,

      entityId,

    });


  if(data.party_id){

    const {
      data:party,
      error,
    } =
      await supabaseAdmin
        .from("parties")
        .select("*")
        .eq(
          "id",
          data.party_id
        )
        .single();


    if(!error){

      context.party =
        party;

    }

  }


  if(
    !context.party &&
    data.customer_id
  ){

    const {
      data:customer,
      error:customerError,
    } =
      await supabaseAdmin
        .from("customer_loyalty_accounts")
        .select("party_id")
        .eq(
          "id",
          data.customer_id
        )
        .single();


    if(
      !customerError &&
      customer?.party_id
    ){

      const {
        data:party,
        error:partyError,
      } =
        await supabaseAdmin
          .from("parties")
          .select("*")
          .eq(
            "id",
            customer.party_id
          )
          .single();


      if(!partyError){

        context.party =
          party;

      }

    }

  }


  console.log(
    {
      documentType,
      customer_id: data.customer_id,
      party: context.party,
      lines: context.data?.lines,
    }
  );

  console.log(
    {
      documentType,
      data,
      party: context.party,
      brand: context.brand,
    }
  );

  return context;

}
