export function createServiceUsageRecord(data = {}) {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),

    organization_id: data.organization_id,
    bill_to_organization_id: data.bill_to_organization_id || data.organization_id,

    workspace: data.workspace || null,
    module: data.module || null,
    project_id: data.project_id || null,
    user_id: data.user_id || null,

    category: data.category,
    provider: data.provider,
    capability: data.capability,
    operation: data.operation,

    quantity: Number(data.quantity || 1),
    unit: data.unit || "request",

    supplier_cost: Number(data.supplier_cost || 0),
    platform_markup: Number(data.platform_markup || 0),
    customer_price: Number(data.customer_price || 0),

    currency: data.currency || "USD",

    status: data.status || "SUCCESS",
    latency_ms: data.latency_ms || null,

    invoice_status: "UNBILLED",
    invoice_id: null,

    metadata: data.metadata || {},

    created_at: now,
  };
}
