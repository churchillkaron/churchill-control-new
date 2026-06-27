import { createServerSupabase } from "@/lib/shared/supabase/server";
import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

export default async function createFixedAsset({
  organization_id,
  asset_name,
  asset_category = null,
  purchase_date = null,
  purchase_cost,
  useful_life_years = 5,
  salvage_value = 0,
  depreciation_method = "straight_line",
  vendor_id = null,
  legal_entity_id = null,
  cost_center_id = null,
  notes = null,
}) {

  try {

    if (!organization_id) throw new Error("organization_id required");
    if (!asset_name) throw new Error("asset_name required");

    const cost =
      Number(purchase_cost || 0);

    const salvage =
      Number(salvage_value || 0);

    const life =
      Number(useful_life_years || 0);

    if (cost <= 0) {
      throw new Error("purchase_cost must be greater than 0");
    }

    if (life <= 0) {
      throw new Error("useful_life_years must be greater than 0");
    }

    if (salvage < 0) {
      throw new Error("salvage_value cannot be negative");
    }

    if (salvage > cost) {
      throw new Error("salvage_value cannot exceed purchase_cost");
    }

    const assetCode =
      `FA-${Date.now()}`;

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("fixed_assets")
      .insert([
        {
          organization_id,
          asset_code: assetCode,
          asset_name,
          asset_category,
          purchase_date,
          purchase_cost: cost,
          useful_life_years: life,
          salvage_value: salvage,
          depreciation_method,
          accumulated_depreciation: 0,
          current_book_value: cost,
          status: "active",
          vendor_id,
          legal_entity_id,
          cost_center_id,
          notes,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      asset: data,
    };

  } catch (error) {

    return {
      success: false,
      error: error.message,
    };

  }

}
