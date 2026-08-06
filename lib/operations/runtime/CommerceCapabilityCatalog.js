const freezeList = (value = []) => Object.freeze([...value]);

function defineCommerceCapability({
  id,
  name,
  description,
  commands,
  events,
  recordType = "execution",
  consumes = [],
  boundary = null,
  readOnly = false,
}) {
  return Object.freeze({
    id,
    name,
    group: "commerce-execution",
    description,
    lifecycle: "commerce",
    commands: freezeList(commands),
    events: freezeList(events),
    readOnly,
    recordType,
    owner: "operations",
    consumes: freezeList(consumes),
    boundary,
  });
}

export const OPERATIONS_COMMERCE_CAPABILITY_CATALOG = Object.freeze([
  defineCommerceCapability({
    id: "point-of-sale",
    name: "Point of Sale",
    description:
      "Provide a configurable transaction workspace for order capture, checkout, receipts and cash control without embedding industry workflows.",
    commands: ["configure", "activate", "deactivate"],
    events: ["configured", "activated", "deactivated"],
    recordType: "application",
    consumes: [
      "commercial.catalog",
      "commercial.pricing",
      "commercial.customers",
      "finance.payment-methods",
    ],
    boundary:
      "Industry-specific service flows are supplied by registered application adapters. Finance remains authoritative for accounting and settlement posting.",
  }),
  defineCommerceCapability({
    id: "order-capture",
    name: "Order Capture",
    description:
      "Create and amend customer orders from terminals, mobile devices, kiosks, portals and connected channels.",
    commands: ["create", "update", "submit", "cancel", "reopen"],
    events: ["created", "updated", "submitted", "cancelled", "reopened"],
    recordType: "document",
    consumes: [
      "commercial.catalog",
      "commercial.pricing",
      "commercial.customers",
      "supply-chain.availability",
    ],
    boundary:
      "The capability captures operational demand; product, price, customer and inventory masters remain owned by their source domains.",
  }),
  defineCommerceCapability({
    id: "checkout",
    name: "Checkout",
    description:
      "Calculate the payable balance, allocate tenders and execute controlled settlement for an order or order group.",
    commands: ["prepare", "allocate", "authorize", "capture", "void", "refund"],
    events: ["prepared", "allocated", "authorized", "captured", "voided", "refunded"],
    recordType: "execution",
    consumes: [
      "commercial.orders",
      "finance.payment-methods",
      "finance.tax-policy",
      "finance.posting",
    ],
    boundary:
      "Operations owns checkout execution and tender capture. Finance owns monetary accounting, tax configuration, journals and ledgers.",
  }),
  defineCommerceCapability({
    id: "receipts",
    name: "Receipts",
    description:
      "Issue, reissue and deliver transaction receipts through configured output channels.",
    commands: ["issue", "reissue", "deliver", "void"],
    events: ["issued", "reissued", "delivered", "voided"],
    recordType: "evidence",
    consumes: ["finance.payments", "documents.templates", "services.communication"],
  }),
  defineCommerceCapability({
    id: "cash-control",
    name: "Cash Control",
    description:
      "Open, operate, reconcile and close accountable till, drawer and terminal cash sessions.",
    commands: ["open", "record", "count", "reconcile", "close", "reopen"],
    events: ["opened", "recorded", "counted", "reconciled", "closed", "reopened"],
    recordType: "execution",
    consumes: ["people.workers", "finance.cash-accounts"],
    boundary:
      "Operations controls the physical session and evidence. Finance owns the cash account and resulting accounting entries.",
  }),
  defineCommerceCapability({
    id: "fulfillment-dispatch",
    name: "Fulfillment Dispatch",
    description:
      "Translate submitted order demand into neutral work, queue and work-centre execution requests.",
    commands: ["dispatch", "redispatch", "hold", "release", "cancel"],
    events: ["dispatched", "redispatched", "held", "released", "cancelled"],
    recordType: "execution",
    consumes: ["operations.work-centres", "operations.queues", "commercial.orders"],
    boundary:
      "Kitchen, warehouse, service desk and other industry execution views are adapters over neutral work-centre and queue concepts.",
  }),
]);

export function getOperationsCommerceCapability(capabilityId) {
  return (
    OPERATIONS_COMMERCE_CAPABILITY_CATALOG.find(
      (capability) => capability.id === capabilityId
    ) || null
  );
}

export default OPERATIONS_COMMERCE_CAPABILITY_CATALOG;
