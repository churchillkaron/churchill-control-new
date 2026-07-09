import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";


export async function createVendor(data) {


  const {

    organization_id,

    vendor_code = null,

    legal_name,

    display_name,

    tax_id = null,

    email = null,

    phone = null,

    address = null,

    payment_terms = null,

    default_expense_account = null,

    default_ap_account = null,

    risk_level = "LOW",

    notes = null,

    is_active = true,

    is_blocked = false,

  } = data;



  if (!organization_id) {

    throw new Error(
      "organization_id required"
    );

  }



  if (!legal_name) {

    throw new Error(
      "legal_name required"
    );

  }



  const now =
    new Date().toISOString();



  /*
    1. Create party master record
  */

  const {
    data: party,
    error: partyError,
  } =
    await supabaseAdmin
      .from("parties")
      .insert({

        organization_id,

        party_type:
          "organization",

        legal_name,

        display_name,

        tax_id,

        email,

        phone,

        address,

        status:
          "ACTIVE",

        created_at:
          now,

        updated_at:
          now,

      })
      .select()
      .single();



  if (partyError) {

    throw partyError;

  }



  /*
    2. Create supplier relationship
  */

  const {
    error: relationshipError,
  } =
    await supabaseAdmin
      .from("party_relationships")
      .insert({

        party_id:
          party.id,

        organization_id,

        relationship_type:
          "supplier",

        status:
          "ACTIVE",

        metadata:{
          vendor_code,
        },

        created_at:
          now,

        updated_at:
          now,

      });



  if (relationshipError) {

    throw relationshipError;

  }



  /*
    3. Create supplier profile
  */

  const {
    data: profile,
    error: profileError,
  } =
    await supabaseAdmin
      .from("supplier_profiles")
      .insert({

        organization_id,

        party_id:
          party.id,

        vendor_code,

        payment_terms,

        default_expense_account,

        default_ap_account,

        risk_level,

        is_active,

        is_blocked,

        notes,

        created_at:
          now,

        updated_at:
          now,

      })
      .select()
      .single();



  if (profileError) {

    throw profileError;

  }



  return {

    id:
      party.id,

    party,

    supplier_profile:
      profile,

  };


}
