import createFixedAsset from "../documents/createFixedAsset";
import { calculateDepreciation } from "../capabilities/calculateDepreciation";
import { runDepreciation } from "../workflows/runDepreciation";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function createFixedAssetCommand(input) {
  return await createFixedAsset(input);
}

export async function listFixedAssetsCommand(input) {
  const { organization_id, entity_id = null } = input || {};

  if (!organization_id) {
    throw new Error("organization_id required");
  }

  let query = supabaseAdmin
    .from("fixed_assets")
    .select("*")
    .eq("organization_id", organization_id);

  if (entity_id) {
    query = query.eq("entity_id", entity_id);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) throw error;

  return {
    success: true,
    assets: data || [],
  };
}

export async function calculateDepreciationCommand(input = {}) {
  const {
    organization_id,
    entity_id = null,
  } = input;

  if (!organization_id) {
    throw new Error("organization_id required");
  }

  let query = supabaseAdmin
    .from("fixed_assets")
    .select(
      "id, organization_id, entity_id, asset_name, purchase_cost, salvage_value, useful_life_years, depreciation_method, accumulated_depreciation, current_book_value, status"
    )
    .eq("organization_id", organization_id)
    .eq("status", "active");

  if (entity_id) {
    query = query.eq("entity_id", entity_id);
  }

  const { data, error } = await query.order("asset_name", { ascending: true });

  if (error) throw error;

  const assets = data || [];

  return {
    success: true,
    assets: calculateDepreciation({ assets }),
    count: assets.length,
  };
}

export async function runDepreciationCommand(input) {
  return runDepreciation(input);
}

export async function updateFixedAssetCommand(input) {
  const {
    updateFixedAsset,
  } = await import(
    "../repositories/fixedAssetRepository"
  );

  return await updateFixedAsset(input);
}

export async function archiveFixedAssetCommand(input) {
  const {
    archiveFixedAsset,
  } = await import(
    "../repositories/fixedAssetRepository"
  );

  return await archiveFixedAsset(input);
}
