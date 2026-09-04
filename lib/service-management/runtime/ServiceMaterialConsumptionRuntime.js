import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { createInventoryMovement } from "@/lib/inventory/movements/createInventoryMovement";
import { normalizeServiceTreatmentApplications } from "./ServiceTreatmentRuntime";

function materialFields(occurrence = {}) {
  const protocol = occurrence?.attributes?.service_delivery?.execution_protocol || {};
  return (Array.isArray(protocol.field_schema) ? protocol.field_schema : [])
    .filter((field) => String(field?.type || "").toLowerCase() === "material");
}

function materialSubmission(submission = {}, field = {}) {
  const fields = submission?.responses || submission?.fields || {};
  const value = fields?.[field.key] || {};
  return {
    sourceKey: field.key,
    itemId: value.item_id || field.item_id || field.inventory_item_id || null,
    warehouseId: value.warehouse_id || field.warehouse_id || null,
    locationId: value.location_id || field.location_id || null,
    quantity: Number(value.quantity || 0),
    name: value.material_name || field.material_name || field.item_name || field.label || "Material",
    unit: value.unit || field.unit || null,
    treatment: null,
  };
}

function rawTreatmentApplications(submission = {}, occurrence = {}) {
  if (Array.isArray(submission.treatment_applications)) return submission.treatment_applications;
  if (Array.isArray(submission?.responses?.__treatment_applications)) return submission.responses.__treatment_applications;
  if (Array.isArray(occurrence?.attributes?.service_treatment?.applications)) {
    return occurrence.attributes.service_treatment.applications;
  }
  return [];
}

function treatmentMaterials(applications = []) {
  return applications.map((application, index) => ({
    sourceKey: application.application_id || `application-${index + 1}`,
    itemId: application.item_id || null,
    warehouseId: application.warehouse_id || null,
    locationId: application.location_id || null,
    quantity: Number(application.quantity || 0),
    name: application.material_name || "Treatment material",
    unit: application.unit || null,
    treatment: {
      application_method: application.application_method || null,
      target_pests: Array.isArray(application.target_pests) ? application.target_pests : [],
      treatment_area: application.treatment_area || null,
      dilution_rate: application.dilution_rate || null,
      device: application.device || null,
      registration_number: application.registration_number || null,
      active_ingredients: application.active_ingredients || null,
      batch_lot: application.batch_lot || null,
      notes: application.notes || null,
      stock_before: application.stock_before ?? null,
      projected_stock_after: application.projected_stock_after ?? null,
      stock_shortage: Boolean(application.stock_shortage),
    },
  }));
}

async function findExistingMovement({ organizationId, entityId, occurrenceId, sourceKey, itemId }) {
  const sourceDocument = `service-material:${sourceKey}`;
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

  const rawApplications = rawTreatmentApplications(submission, occurrence);
  const normalizedApplications = rawApplications.length
    ? await normalizeServiceTreatmentApplications({
        organizationId,
        entityId,
        applications: rawApplications,
      })
    : [];

  const shortage = normalizedApplications.find((application) => application.stock_shortage);
  if (shortage) {
    const error = new Error(`Insufficient stock for ${shortage.material_name}. Projected stock would be ${shortage.projected_stock_after} ${shortage.unit || ""}.`.trim());
    error.status = 409;
    throw error;
  }

  const legacyMaterials = materialFields(occurrence).map((field) => materialSubmission(submission, field));
  const applicationMaterials = treatmentMaterials(normalizedApplications);
  const materials = [...legacyMaterials, ...applicationMaterials]
    .filter((material) => material.quantity > 0);

  if (!materials.length) {
    return { consumed: 0, movements: [] };
  }

  if (!entityId) {
    const error = new Error("Service material consumption requires entity_id on the service occurrence.");
    error.status = 409;
    throw error;
  }

  const movements = [];

  for (const material of materials) {
    if (!material.itemId) {
      const error = new Error(`Material ${material.name || material.sourceKey} is missing an inventory item.`);
      error.status = 409;
      throw error;
    }

    const existing = await findExistingMovement({
      organizationId,
      entityId,
      occurrenceId,
      sourceKey: material.sourceKey,
      itemId: material.itemId,
    });

    if (existing) {
      movements.push({
        application_id: material.treatment ? material.sourceKey : null,
        field_key: material.treatment ? null : material.sourceKey,
        item_id: material.itemId,
        material_name: material.name,
        unit: material.unit,
        quantity: Number(existing.quantity || material.quantity),
        warehouse_id: material.warehouseId,
        location_id: material.locationId,
        treatment: material.treatment,
        movement_id: existing.id,
        document_id: existing.document_id || null,
        idempotent_replay: true,
      });
      continue;
    }

    const sourceDocument = `service-material:${material.sourceKey}`;
    const treatmentDescription = material.treatment
      ? [
          material.treatment.application_method,
          material.treatment.treatment_area,
          material.treatment.target_pests?.length ? `target ${material.treatment.target_pests.join(", ")}` : null,
        ].filter(Boolean).join(" · ")
      : null;
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
      notes: `${material.name}${material.unit ? ` (${material.unit})` : ""} used during service completion${treatmentDescription ? ` · ${treatmentDescription}` : ""}.`,
      createdBy: staffId,
      postToFinance: false,
    });

    movements.push({
      application_id: material.treatment ? material.sourceKey : null,
      field_key: material.treatment ? null : material.sourceKey,
      item_id: material.itemId,
      material_name: material.name,
      unit: material.unit,
      quantity: material.quantity,
      warehouse_id: material.warehouseId,
      location_id: material.locationId,
      treatment: material.treatment,
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
