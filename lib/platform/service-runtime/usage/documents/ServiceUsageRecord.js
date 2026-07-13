export function createServiceUsageRecord(data = {}) {
  const now =
    new Date().toISOString();

  if (!data.organization_id) {
    throw new Error(
      "organization_id required"
    );
  }

  if (!data.capability) {
    throw new Error(
      "capability required"
    );
  }

  if (!data.provider) {
    throw new Error(
      "provider required"
    );
  }

  return {
    id:
      data.id ||
      crypto.randomUUID(),

    organization_id:
      data.organization_id,

    bill_to_organization_id:
      data.bill_to_organization_id ||
      data.organization_id,

    party_id:
      data.party_id || null,

    entity_id:
      data.entity_id || null,

    organization_service_id:
      data.organization_service_id ||
      null,

    pricing_id:
      data.pricing_id || null,

    workspace:
      data.workspace || null,

    module:
      data.module || null,

    project_id:
      data.project_id || null,

    user_id:
      data.user_id || null,

    category:
      data.category || "SERVICE",

    provider:
      data.provider,

    capability:
      data.capability,

    operation:
      data.operation ||
      data.capability,

    quantity:
      Number(
        data.quantity || 1
      ),

    unit:
      data.unit || "request",

    supplier_cost:
      Number(
        data.supplier_cost || 0
      ),

    platform_markup:
      Number(
        data.platform_markup || 0
      ),

    customer_price:
      Number(
        data.customer_price || 0
      ),

    currency:
      data.currency || "USD",

    status:
      data.status || "PENDING",

    latency_ms:
      data.latency_ms || null,

    invoice_status:
      data.invoice_status ||
      "UNBILLED",

    invoice_id:
      data.invoice_id || null,

    billing_invoice_line_id:
      data.billing_invoice_line_id ||
      null,

    error_message:
      data.error_message || null,

    metadata:
      data.metadata || {},

    created_at:
      data.created_at || now,

    updated_at:
      now,
  };
}
