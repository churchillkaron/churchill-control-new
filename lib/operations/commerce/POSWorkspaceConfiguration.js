const CORE_POS_MODES = Object.freeze([
  Object.freeze({
    id: "sell",
    label: "Sell",
    icon: "Monitor",
    component: "order-capture",
    capability: "order-capture",
    aliases: Object.freeze([
      "stationary",
      "pos",
      "sale",
    ]),
  }),
  Object.freeze({
    id: "checkout",
    label: "Checkout",
    icon: "Banknote",
    component: "checkout",
    capability: "checkout",
    aliases: Object.freeze([
      "payment",
      "payments",
      "settlement",
    ]),
  }),
  Object.freeze({
    id: "orders",
    label: "Orders",
    icon: "ClipboardList",
    component: "orders",
    capability: "order-capture",
    aliases: Object.freeze([]),
  }),
  Object.freeze({
    id: "receipts",
    label: "Receipts",
    icon: "ReceiptText",
    component: "receipts",
    capability: "receipts",
    aliases: Object.freeze([
      "receipt",
    ]),
  }),
  Object.freeze({
    id: "cash-control",
    label: "Cash Control",
    icon: "Users",
    component: "cash-control",
    capability: "cash-control",
    aliases: Object.freeze([
      "shift",
      "shifts",
      "drawer",
      "till",
    ]),
  }),
]);

const CORE_POS_ALIASES = Object.freeze(
  Object.fromEntries(
    CORE_POS_MODES.flatMap(
      mode =>
        (mode.aliases || []).map(
          alias => [
            alias,
            mode.id,
          ]
        )
    )
  )
);

function copyContext(
  application
) {
  const context =
    application?.context;

  if (
    !context ||
    typeof context !==
      "object"
  ) {
    return null;
  }

  return Object.freeze({
    ...context,
    legacyQueryKeys:
      Object.freeze(
        Array.isArray(
          context.legacyQueryKeys
        )
          ? [
              ...context
                .legacyQueryKeys,
            ]
          : []
      ),
  });
}

function copyPresentation(
  application
) {
  const presentation =
    application?.presentation;

  if (
    !presentation ||
    typeof presentation !==
      "object"
  ) {
    return null;
  }

  return Object.freeze({
    ...presentation,
  });
}

export function buildPOSWorkspaceConfiguration({
  application,
} = {}) {
  const applicationId =
    String(
      application?.id ||
      ""
    ).trim() ||
    null;

  const applicationStatus =
    String(
      application?.status ||
      ""
    ).trim() ||
    null;

  return Object.freeze({
    capability:
      "point-of-sale",

    applicationId,

    applicationStatus,

    modes:
      CORE_POS_MODES,

    aliases:
      CORE_POS_ALIASES,

    context:
      copyContext(
        application
      ),

    presentation:
      copyPresentation(
        application
      ),
  });
}

export function resolvePOSMode(
  configuration,
  value
) {
  const modes =
    configuration?.modes ||
    CORE_POS_MODES;

  const aliases =
    configuration?.aliases ||
    CORE_POS_ALIASES;

  const normalized =
    String(
      value ||
      "sell"
    )
      .trim()
      .toLowerCase();

  const resolved =
    aliases[normalized] ||
    normalized;

  return modes.some(
    mode =>
      mode.id ===
      resolved
  )
    ? resolved
    : "sell";
}

export {
  CORE_POS_ALIASES,
  CORE_POS_MODES,
};

export default buildPOSWorkspaceConfiguration;
