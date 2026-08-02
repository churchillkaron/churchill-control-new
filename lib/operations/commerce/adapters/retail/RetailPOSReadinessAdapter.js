const REQUIRED_BINDINGS = Object.freeze([
  Object.freeze({
    id: "catalog",
    owner: "commercial",
    contract: "commercial.catalog-items",
    description: "Sellable retail items, variants, barcodes, prices and tax categories.",
  }),
  Object.freeze({
    id: "availability",
    owner: "supply-chain",
    contract: "supply-chain.inventory-availability",
    description: "Location-aware stock availability and reservation behavior.",
  }),
  Object.freeze({
    id: "orders",
    owner: "commercial",
    contract: "commercial.sales-orders",
    description: "Canonical retail sales-order and line persistence.",
  }),
  Object.freeze({
    id: "settlement",
    owner: "finance",
    contract: "finance.payment-settlement",
    description: "Tender authorization, capture, refund and accounting handoff.",
  }),
]);

export async function loadRetailPOSReadiness({ organizationId }) {
  return {
    application_id: "retail",
    status: "configuration_required",
    transaction_ready: false,
    organization_id: organizationId,
    context_schema: {
      type: "sale",
      requires_context: false,
      requires_item_assignment: false,
    },
    context_groups: [],
    contexts: [],
    catalog: {
      items: [],
      item_count: 0,
    },
    fulfillment: {
      mode: "inventory_handoff",
      route: null,
    },
    readiness: {
      state: "blocked",
      reason:
        "Retail POS requires canonical catalog, inventory availability, sales-order and payment-settlement bindings before transactions can be activated.",
      required_bindings: REQUIRED_BINDINGS,
    },
  };
}

const RetailPOSReadinessAdapter = Object.freeze({
  id: "retail",
  loadRuntime: loadRetailPOSReadiness,
});

export default RetailPOSReadinessAdapter;
