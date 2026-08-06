const CORE_POS_MODES = Object.freeze([
  Object.freeze({
    id: "sell",
    label: "Sell",
    icon: "Monitor",
    component: "order-capture",
    capability: "order-capture",
    aliases: Object.freeze(["stationary", "pos", "sale", "new-order"]),
  }),
  Object.freeze({
    id: "orders",
    label: "Orders",
    icon: "ClipboardList",
    component: "orders",
    capability: "order-capture",
    aliases: Object.freeze(["order-control", "history"]),
  }),
  Object.freeze({
    id: "checkout",
    label: "Checkout & Payment",
    icon: "Banknote",
    component: "checkout",
    capability: "checkout",
    aliases: Object.freeze(["payment", "payments", "settlement", "pay"]),
  }),
  Object.freeze({
    id: "receipts",
    label: "Receipts",
    icon: "ReceiptText",
    component: "receipts",
    capability: "receipts",
    aliases: Object.freeze(["receipt"]),
  }),
  Object.freeze({
    id: "cash-control",
    label: "Cash & Shifts",
    icon: "Users",
    component: "cash-control",
    capability: "cash-control",
    aliases: Object.freeze(["shift", "shifts", "drawer", "till", "cash"]),
  }),
  Object.freeze({
    id: "fulfillment",
    label: "Fulfillment",
    icon: "PackageCheck",
    component: "fulfillment",
    capability: "fulfillment-dispatch",
    aliases: Object.freeze(["dispatch", "production", "work-centres"]),
  }),
]);

const RESTAURANT_POS_APPLICATION = Object.freeze({
  id: "restaurant",
  status: "active",
  realtimeSubscriptions: Object.freeze([
    Object.freeze({ table: "restaurant_tables" }),
  ]),
  modeOverrides: Object.freeze({
    sell: Object.freeze({ component: "restaurant-order-entry" }),
    checkout: Object.freeze({ component: "restaurant-checkout" }),
    orders: Object.freeze({ component: "restaurant-orders" }),
    receipts: Object.freeze({ component: "restaurant-receipts" }),
    "cash-control": Object.freeze({ component: "restaurant-cash-control" }),
    fulfillment: Object.freeze({ component: "restaurant-fulfillment" }),
  }),
  modes: Object.freeze([
    Object.freeze({
      id: "contexts",
      label: "Floor & Contexts",
      icon: "LayoutGrid",
      component: "restaurant-context-control",
      capability: "order-capture",
      aliases: Object.freeze(["floor", "tables", "contexts"]),
    }),
    Object.freeze({
      id: "mobile-service",
      label: "Mobile Service",
      icon: "Smartphone",
      component: "restaurant-service",
      capability: "order-capture",
      aliases: Object.freeze(["service", "waiter", "tableside"]),
    }),
  ]),
  context: Object.freeze({
    type: "service-location",
    queryKey: "service_context",
    legacyQueryKeys: Object.freeze(["table"]),
    singularLabel: "Table",
    pluralLabel: "Tables",
  }),
  presentation: Object.freeze({
    workspaceTitle: "Stationary POS",
    workspaceDescription:
      "Create orders, manage active service, settle payments, issue receipts, control cash shifts and follow fulfillment from one workspace.",
    orderEyebrow: "Restaurant Operations",
    emptyPayables: "No unpaid restaurant orders.",
  }),
});

const RETAIL_POS_APPLICATION = Object.freeze({
  id: "retail",
  status: "partially_ready",
  realtimeSubscriptions: Object.freeze([]),
  modeOverrides: Object.freeze({
    sell: Object.freeze({ component: "retail-catalog" }),
    checkout: Object.freeze({ component: "retail-checkout" }),
    orders: Object.freeze({ component: "retail-orders" }),
    receipts: Object.freeze({ component: "retail-readiness" }),
    "cash-control": Object.freeze({ component: "retail-cash-control" }),
    fulfillment: Object.freeze({ component: "retail-readiness" }),
  }),
  modes: Object.freeze([]),
  context: Object.freeze({
    type: "sale",
    queryKey: "sale",
    legacyQueryKeys: Object.freeze([]),
    singularLabel: "Sale",
    pluralLabel: "Sales",
  }),
  presentation: Object.freeze({
    workspaceTitle: "Stationary POS",
    workspaceDescription:
      "Sell, manage orders, settle payments, control cash sessions and complete the configured retail transaction flow.",
    orderEyebrow: "Retail Operations",
    emptyPayables: "No confirmed unpaid retail sales.",
    readinessTitle: "Retail receipts and fulfillment remain controlled transitions",
    readinessDescription:
      "Catalog, inventory reservation, Commercial sales orders and full cash settlement are connected. Provider-authorized tenders, fulfillment consumption, refunds and receipt rendering remain separate contracts.",
  }),
});

const POS_APPLICATION_PROFILES = Object.freeze({
  restaurant: RESTAURANT_POS_APPLICATION,
  retail: RETAIL_POS_APPLICATION,
});

const POS_APPLICATION_ALIASES = Object.freeze({
  restaurant_service: "restaurant",
  restaurant_bar: "restaurant",
  bar_restaurant: "restaurant",
  food_and_beverage: "restaurant",
  food_beverage: "restaurant",
  cafe: "restaurant",
  cafe_restaurant: "restaurant",
  bar: "restaurant",
  retail_store: "retail",
  store: "retail",
  shop: "retail",
  boutique: "retail",
  supermarket: "retail",
});

function normalizeApplicationId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function resolveApplicationProfile({ organization, applicationId } = {}) {
  const candidates = [
    applicationId,
    organization?.operations_application,
    organization?.industry_application,
    organization?.organization_type,
    organization?.type,
    organization?.industry,
  ]
    .map(normalizeApplicationId)
    .filter(Boolean);

  for (const candidate of candidates) {
    const profileId = POS_APPLICATION_ALIASES[candidate] || candidate;
    if (POS_APPLICATION_PROFILES[profileId]) {
      return POS_APPLICATION_PROFILES[profileId];
    }
  }

  return null;
}

function applyModeOverrides(modes, overrides = {}) {
  return modes.map((mode) =>
    Object.freeze({
      ...mode,
      ...(overrides[mode.id] || {}),
    })
  );
}

export function buildPOSWorkspaceConfiguration(input = {}) {
  const application = resolveApplicationProfile(input);
  const modes = Object.freeze([
    ...applyModeOverrides(
      CORE_POS_MODES,
      application?.modeOverrides || {}
    ),
    ...(application?.modes || []),
  ]);

  const aliases = Object.freeze(
    Object.fromEntries(
      modes.flatMap((mode) =>
        (mode.aliases || []).map((alias) => [alias, mode.id])
      )
    )
  );

  return Object.freeze({
    capability: "point-of-sale",
    applicationId: application?.id || null,
    applicationStatus: application?.status || null,
    realtimeSubscriptions:
      application?.realtimeSubscriptions || Object.freeze([]),
    modes,
    aliases,
    context: application?.context || null,
    presentation: application?.presentation || null,
  });
}

export function resolvePOSMode(configuration, value) {
  const modes = configuration?.modes || CORE_POS_MODES;
  const aliases = configuration?.aliases || {};
  const normalized = String(value || "sell").trim().toLowerCase();
  const resolved = aliases[normalized] || normalized;

  return modes.some((mode) => mode.id === resolved) ? resolved : "sell";
}

export {
  CORE_POS_MODES,
  POS_APPLICATION_ALIASES,
  POS_APPLICATION_PROFILES,
};

export default buildPOSWorkspaceConfiguration;
