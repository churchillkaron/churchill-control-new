import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function listPaymentTerms({
  organization_id,
}) {

  const { data, error } =
    await supabaseAdmin
      .from("payment_terms")
      .select("*")
      .eq(
        "organization_id",
        organization_id
      )
      .order(
        "name",
        {
          ascending:true,
        }
      );

  if(error) throw error;

  return data || [];
}


export async function upsertPaymentTerm({
  organization_id,
  values,
}) {

  const { data, error } =
    await supabaseAdmin
      .from("payment_terms")
      .upsert({
        organization_id,
        ...values,
      })
      .select()
      .single();

  if(error) throw error;

  return data;
}


export async function archivePaymentTerm({
  organization_id,
  id,
}) {

  const { error } =
    await supabaseAdmin
      .from("payment_terms")
      .update({
        status:"ARCHIVED",
      })
      .eq(
        "organization_id",
        organization_id
      )
      .eq(
        "id",
        id
      );

  if(error) throw error;

  return true;
}
