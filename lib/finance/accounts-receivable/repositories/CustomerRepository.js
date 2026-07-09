import { supabaseAdmin } from "@/lib/shared/supabase/admin";


export async function findCustomerByParty({
  party_id,
  organization_id,
}) {

  if (!party_id) {
    throw new Error("party_id required");
  }

  if (!organization_id) {
    throw new Error("organization_id required");
  }


  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from("customer_loyalty_accounts")
      .select("id, party_id")
      .eq(
        "party_id",
        party_id
      )
      .eq(
        "organization_id",
        organization_id
      )
      .single();


  if (error) {
    throw error;
  }


  return data;

}
