import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const COST_CENTRE_TYPES = new Set([
  "OPERATIONAL",
  "ADMINISTRATIVE",
  "SALES",
  "SERVICE",
  "PROJECT",
  "SHARED",
  "OTHER",
]);

function cleanText(value) {
  return typeof value === "string" ? value.trim() : value;
}

export default async function createCostCenter({
  organization_id,
  entity_id = null,
  code,
  name,
  type = "OPERATIONAL",
  parent_cost_center_id = null,
  manager = null,
  is_active = true,
}) {
  try {
    if (!organization_id) {
      throw new Error("organization_id required");
    }

    const normalizedCode = String(code || "").trim().toUpperCase();
    const normalizedName = String(name || "").trim();
    const normalizedType = String(type || "OPERATIONAL")
      .trim()
      .toUpperCase();

    if (!normalizedCode) {
      throw new Error("code required");
    }

    if (!normalizedName) {
      throw new Error("name required");
    }

    if (!COST_CENTRE_TYPES.has(normalizedType)) {
      throw new Error("Cost Centre Type is not supported");
    }

    if (entity_id) {
      const { data: entity, error: entityError } = await supabaseAdmin
        .from("legal_entities")
        .select("id")
        .eq("organization_id", organization_id)
        .eq("id", entity_id)
        .maybeSingle();

      if (entityError) throw entityError;
      if (!entity) {
        throw new Error("Legal Entity is outside organisation scope");
      }
    }

    if (parent_cost_center_id) {
      let parentQuery = supabaseAdmin
        .from("cost_centers")
        .select("id, entity_id, is_active")
        .eq("organization_id", organization_id)
        .eq("id", parent_cost_center_id);

      if (entity_id) {
        parentQuery = parentQuery.or(
          `entity_id.eq.${entity_id},entity_id.is.null`
        );
      } else {
        parentQuery = parentQuery.is("entity_id", null);
      }

      const { data: parent, error: parentError } =
        await parentQuery.maybeSingle();

      if (parentError) throw parentError;
      if (!parent) {
        throw new Error("Parent Cost Centre is outside the selected scope");
      }
      if (parent.is_active === false) {
        throw new Error("Parent Cost Centre is inactive");
      }
    }

    let duplicateQuery = supabaseAdmin
      .from("cost_centers")
      .select("id")
      .eq("organization_id", organization_id)
      .eq("code", normalizedCode);

    duplicateQuery = entity_id
      ? duplicateQuery.eq("entity_id", entity_id)
      : duplicateQuery.is("entity_id", null);

    const { data: existing, error: existingError } =
      await duplicateQuery.limit(1).maybeSingle();

    if (existingError) throw existingError;
    if (existing) {
      throw new Error("COST_CENTER_CODE_EXISTS");
    }

    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("cost_centers")
      .insert({
        organization_id,
        entity_id: entity_id || null,
        code: normalizedCode,
        name: normalizedName,
        type: normalizedType,
        parent_cost_center_id: parent_cost_center_id || null,
        manager: cleanText(manager) || null,
        is_active: is_active !== false,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      costCenter: data,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
