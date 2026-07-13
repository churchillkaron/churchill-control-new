import { supabase } from "@/lib/supabase";

export async function runVarianceAnalysis({
  organizationId,
  organization_id,
  entityId = null,
  entity_id = null,
  itemId,
  varianceQuantity,
  varianceValue,
}) {
  const resolvedOrganizationId =
    organizationId || organization_id;

  const resolvedEntityId =
    entityId || entity_id || null;

  if (!resolvedOrganizationId) {
    throw new Error("organizationId required");
  }

  if (!resolvedEntityId) {
    throw new Error("entityId required");
  }

  let risk = "low";

  if (
    Math.abs(
      Number(varianceValue || 0)
    ) > 1000
  ) {
    risk = "medium";
  }

  if (
    Math.abs(
      Number(varianceValue || 0)
    ) > 5000
  ) {
    risk = "high";
  }

  const type =
    varianceQuantity > 0
      ? "OVERAGE"
      : "SHORTAGE";

  const { data, error } =
    await supabase
      .from(
        "inventory_variance_analysis"
      )
      .insert({
        organization_id: resolvedOrganizationId,
        entity_id: resolvedEntityId,
        item_id: itemId,
        variance_type: type,
        variance_quantity:
          varianceQuantity,
        variance_value:
          varianceValue,
        risk_level: risk,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
