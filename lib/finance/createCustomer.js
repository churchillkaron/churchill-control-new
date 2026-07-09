import { supabaseAdmin } from "@/lib/shared/supabase/admin";


export async function createCustomer(data) {

  const {
    organization_id,
    entity_id,
    customer_name,
    customer_phone,
    customer_email,

    customer_type,
    company_name,
    tax_number,

    billing_address,
    shipping_address,

    city,
    state,
    postal_code,
    country,

    preferred_language,
    preferred_currency,

    credit_limit,
    payment_terms,

    birthday,
    notes,
  } = data;


  if (!organization_id) {
    throw new Error("organization_id required");
  }


  if (!customer_name) {
    throw new Error("customer_name required");
  }


  /*
    1. Resolve existing party
  */

  let partyQuery =
    supabaseAdmin
      .from("parties")
      .select("*")
      .eq(
        "organization_id",
        organization_id
      );


  if (customer_phone) {

    partyQuery =
      partyQuery.eq(
        "phone",
        customer_phone
      );

  } else if (customer_email) {

    partyQuery =
      partyQuery.eq(
        "email",
        customer_email
      );

  } else {

    partyQuery =
      partyQuery.eq(
        "display_name",
        customer_name
      );

  }


  const {
    data: existingParty,
    error: partyError,
  } =
    await partyQuery.maybeSingle();


  if (partyError) {
    throw partyError;
  }


  let party =
    existingParty;


  /*
    2. Create party if missing
  */

  if (!party) {

    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from("parties")
        .insert({

          organization_id,

          party_type:
            customer_type === "COMPANY"
              ? "organization"
              : "person",

          display_name:
            company_name ||
            customer_name,

          email:
            customer_email || null,

          phone:
            customer_phone || null,

        })
        .select()
        .single();


    if (error) {
      throw error;
    }


    party = data;

  }


  /*
    3. Ensure customer relationship
  */

  const {
    data: relationship,
    error: relationshipError,
  } =
    await supabaseAdmin
      .from("party_relationships")
      .select("*")
      .eq(
        "party_id",
        party.id
      )
      .eq(
        "organization_id",
        organization_id
      )
      .eq(
        "relationship_type",
        "customer"
      )
      .maybeSingle();


  if (relationshipError) {
    throw relationshipError;
  }


  if (!relationship) {

    const {
      error,
    } =
      await supabaseAdmin
        .from("party_relationships")
        .insert({

          party_id:
            party.id,

          organization_id,

          relationship_type:
            "customer",

        });


    if (error) {
      throw error;
    }

  }


  /*
    4. Create/update loyalty profile
  */

  const {
    data: existingCustomer,
    error: existingCustomerError,
  } =
    await supabaseAdmin
      .from("customer_loyalty_accounts")
      .select("*")
      .eq(
        "party_id",
        party.id
      )
      .maybeSingle();


  if (existingCustomerError) {
    throw existingCustomerError;
  }


  let customer;


  const customerPayload = {

    organization_id,

    entity_id,

    party_id:
      party.id,

    customer_name,

    customer_phone,

    customer_email,

    customer_type:
      customer_type || "PERSON",

    company_name:
      company_name || null,

    tax_number:
      tax_number || null,

    billing_address:
      billing_address || null,

    shipping_address:
      shipping_address || null,

    city:
      city || null,

    state:
      state || null,

    postal_code:
      postal_code || null,

    country:
      country || null,

    preferred_language:
      preferred_language || null,

    preferred_currency:
      preferred_currency || "THB",

    credit_limit:
      credit_limit || 0,

    payment_terms:
      payment_terms || null,

    birthday,

    notes,

    updated_at:
      new Date().toISOString(),

  };


  if (existingCustomer) {

    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from("customer_loyalty_accounts")
        .update(customerPayload)
        .eq(
          "id",
          existingCustomer.id
        )
        .select()
        .single();


    if(error){
      throw error;
    }


    customer = data;

  } else {

    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from("customer_loyalty_accounts")
        .insert(customerPayload)
        .select()
        .single();


    if(error){
      throw error;
    }


    customer = data;

  }


  return {

    party,

    customer,

  };

}
