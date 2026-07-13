import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import {
  resolveBrand,
} from "../branding/BrandResolver";


import {
  resolveBusinessContext,
} from "@/lib/business-context/resolveBusinessContext";


export async function resolveDocumentContext({

  documentType,

  organizationId,

  entityId,

  data = {},

}) {


  let context = {

    documentType,

    data,

    organization:
      data.document?.organization ||
      null,

    entity:
      data.document?.entity ||
      null,

    period:
      data.document?.period ||
      null,

    currency:
      data.document?.currency ||
      null,

    party:null,

    brand:null,

  };


  context.brand =
    await resolveBrand({

      organizationId,

      entityId,

    });


  const businessContext =
    await resolveBusinessContext({

      organizationId,

      entityId,

    });


  context.organization =
    businessContext.organization || null;


  context.entity =
    businessContext.entity || null;


  context.period =
    businessContext.period || null;


  context.currency =
    {
      code:
        businessContext.currency || null,
    };


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
