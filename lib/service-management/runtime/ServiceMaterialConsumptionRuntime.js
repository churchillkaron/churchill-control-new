import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { createInventoryMovement } from "@/lib/inventory/movements/createInventoryMovement";

function materialFields(occurrence = {}) {
  const protocol = occurrence?.attributes?.service_delivery?.execution_protocol || {};
  return (Array.isArray(protocol.field_schema) ? protocol.field_schema : [])
    .filter((field) => String(field?.type || "").toLowerCase() === "material");
}

function materialSubmission(submission = {}, field = {}) {
  const value = submission?.fields?.[field.key] || {};
  return {
    itemId: value.item_id || field.item_id || field.inventory_item_id || null,
    warehouseId: value.warehouse_id || field.warehouse_id || null,
    locationId: value.location_id || field.location_id || null,
    quantity: Number(value.quantity || 0),
    name: value.material_name || field.material_name || field.item_name || field.label || "Material",
    unit: value.unit || field.unit || null,
  };
}

async function findExistingMovement({ organizationId, entityId, occurrenceId, fieldKey, itemId }) {
  const sourceDocument = `service-material:${fieldKey}`;
  const result = await supabaseAdmin
    .from("inventory_movements")
    .select("id, document_id, item_id, quantity, movement_date, source_document, source_document_id")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("item_id", itemId)
    .eq("source_document", sourceDocument)
    .eq("source_document_id", occurrenceId)
    .limit(1)
    .maybeSingle();

  if (result.error) throw result.error;
  return result.data || null;
}

export async function consumeServiceMaterials({
  occurrence,
  submission,
  staffId = null,
}) {
  const organizationId = occurrence?.organization_id || null;
  const entityId = occurrence?.entity_id || null;
  const occurrenceId = occurrence?.id || null;

  if (!organizationId || !occurrenceId) {
    throw new Error("Service material consumption requires organization and occurrence context.");
  }

  const fields = materialFields(occurrence);
  if (!fields.length) {
    return { consumed: 0, movements: [] };
  }

  if (!entityId) {
    const error = new Error("Service material consumption requires entity_id on the service occurrence.");
    error.status = 409;
    throw error;
  }

  const movements = [];

  for (const field of fields) {
    const material = materialSubmission(submission, field);
    if (!material.quantity || material.quantity <= 0) continue;

    if (!material.itemId) {
      const error = new Error(`Material field ${field.label || field.key} is missing an inventory item.`);
      error.status = 409;
      throw error;
    }

    const existing = await findExistingMovement({
      organizationId,
      entityId,
      occurrenceId,
      fieldKey: field.key,
      itemId: material.itemId,
    });

    if (existing) {
      movements.push({
        field_key: field.key,
        material_name: material.name,
        unit: material.unit,
        quantity: Number(existing.quantity || material.quantity),
        movement_id: existing.id,
        document_id: existing.document_id || null,
        idempotent_replay: true,
      });
      continue;
    }

    const sourceDocument = `service-material:${field.key}`;
    const result = await createInventoryMovement({
      organizationId,
      entityId,
      itemId: material.itemId,
      warehouseId: material.warehouseId,
      locationId: material.locationId,
      movementType: "CONSUMPTION",
      quantity: material.quantity,
      referenceType: "service-occurrence",
      referenceId: occurrenceId,
      sourceModule: "service-management",
      sourceDocument,
      sourceDocumentId: occurrenceId,
      notes: `${material.name}${material.unit ? ` (${material.unit})` : ""} used during service completion.`,
      createdBy: staffId,
      postToFinance: false,
    });

    movements.push({
      field_key: field.key,
      material_name: material.name,
      unit: material.unit,
      quantity: material.quantity,
      movement_id: result.movement?.id || null,
      document_id: result.document?.id || null,
      idempotent_replay: false,
    });
  }

  return {
    consumed: movements.length,
    movements,
  };
}

export default consumeServiceMaterials;
