import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

const TABLE = "managed_media_campaigns";

export async function createManagedMediaCampaign(record) {
  if (!record?.organization_id) throw new Error("organization_id required");
  if (!record?.provider) throw new Error("provider required");

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert({
      ...record,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateManagedMediaCampaign({
  organization_id,
  id,
  updates,
}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!id) throw new Error("campaign id required");

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organization_id)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getManagedMediaCampaign({
  organization_id,
  id,
}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!id) throw new Error("campaign id required");

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data || null;
}

export async function listManagedMediaCampaigns(organization_id) {
  if (!organization_id) throw new Error("organization_id required");

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function settleManagedMediaCampaign({
  organization_id,
  campaign_id,
  cumulative_provider_spend,
  settlement_key,
  complete = false,
}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!campaign_id) throw new Error("campaign id required");
  if (!settlement_key) throw new Error("settlement key required");

  const { data, error } = await supabaseAdmin.rpc(
    "settle_managed_media_campaign",
    {
      p_organization_id: organization_id,
      p_campaign_id: campaign_id,
      p_cumulative_provider_spend: Number(cumulative_provider_spend || 0),
      p_settlement_key: settlement_key,
      p_complete: Boolean(complete),
    },
  );

  if (error) throw new Error(error.message);
  return data || null;
}
