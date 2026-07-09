import createFixedAsset from "../documents/createFixedAsset";
import { calculateDepreciation } from "../capabilities/calculateDepreciation";
import { runDepreciation } from "../workflows/runDepreciation";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function createFixedAssetCommand(input) {
  return await createFixedAsset(input);
}

export async function listFixedAssetsCommand(input) {
  const { organization_id } = input;

  const { data, error } = await supabaseAdmin
    .from("fixed_assets")
    .select("*")
    .eq("organization_id", organization_id)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return {
    success: true,
    assets: data || [],
  };
}

export async function calculateDepreciationCommand(input) {
  return calculateDepreciation(input);
}

export async function runDepreciationCommand(input) {
  return runDepreciation(input);
}
