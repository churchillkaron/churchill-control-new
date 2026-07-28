import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const EDITABLE_FIELDS = new Set([
  "asset_name",
  "asset_category",
  "purchase_date",
  "purchase_cost",
  "useful_life_years",
  "salvage_value",
  "depreciation_method",
  "supplier_party_id",
  "cost_center_id",
  "notes",
  "status",
]);

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function normalizeValues(values = {}) {
  const payload = {};

  for (const [key, value] of Object.entries(values || {})) {
    if (EDITABLE_FIELDS.has(key)) {
      payload[key] = value;
    }
  }

  if (Object.keys(payload).length === 0) {
    throw new Error("No editable fixed asset fields provided");
  }

  if (payload.purchase_cost !== undefined) {
    const cost = Number(payload.purchase_cost);
    if (!Number.isFinite(cost) || cost <= 0) {
      throw new Error("purchase_cost must be greater than 0");
    }
    payload.purchase_cost = cost;
  }

  if (payload.salvage_value !== undefined) {
    const salvage = Number(payload.salvage_value);
    if (!Number.isFinite(salvage) || salvage < 0) {
      throw new Error("salvage_value cannot be negative");
    }
    payload.salvage_value = salvage;
  }

  if (payload.useful_life_years !== undefined) {
    const life = Number(payload.useful_life_years);
    if (!Number.isFinite(life) || life <= 0) {
      throw new Error("useful_life_years must be greater than 0");
    }
    payload.useful_life_years = life;
  }

  if (
    payload.purchase_cost !== undefined &&
    payload.salvage_value !== undefined &&
    payload.salvage_value > payload.purchase_cost
  ) {
    throw new Error("salvage_value cannot exceed purchase_cost");
  }

  return {
    ...payload,
    updated_at: new Date().toISOString(),
  };
}

export async function updateFixedAsset({
  organization_id,
  entity_id,
  id,
  values,
}) {
  const organizationId = required(organization_id, "organization_id");
  const entityId = required(entity_id, "entity_id");
  const assetId = required(id, "id");
  const payload = normalizeValues(values);

  const { data: current, error: currentError } = await supabaseAdmin
    .from("fixed_assets")
    .select("purchase_cost, salvage_value, accumulated_depreciation")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("id", assetId)
    .maybeSingle();

  if (currentError) throw currentError;
  if (!current) throw new Error("Fixed asset not found in selected legal entity");

  const purchaseCost = Number(
    payload.purchase_cost ?? current.purchase_cost ?? 0
  );
  const salvageValue = Number(
    payload.salvage_value ?? current.salvage_value ?? 0
  );

  if (salvageValue > purchaseCost) {
    throw new Error("salvage_value cannot exceed purchase_cost");
  }

  if (payload.purchase_cost !== undefined || payload.salvage_value !== undefined) {
    payload.current_book_value = Math.max(
      purchaseCost - Number(current.accumulated_depreciation || 0),
      salvageValue
    );
  }

  const { data, error } = await supabaseAdmin
    .from("fixed_assets")
    .update(payload)
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("id", assetId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function archiveFixedAsset({
  organization_id,
  entity_id,
  id,
}) {
  const organizationId = required(organization_id, "organization_id");
  const entityId = required(entity_id, "entity_id");
  const assetId = required(id, "id");

  const { data, error } = await supabaseAdmin
    .from("fixed_assets")
    .update({
      status: "ARCHIVED",
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("id", assetId)
    .select("id, status")
    .single();

  if (error) throw error;
  return data;
}
