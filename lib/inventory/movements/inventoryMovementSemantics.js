const CANONICAL_INBOUND_TYPES =
  Object.freeze([
    "PURCHASE",
    "GOODS_RECEIPT",
    "PRODUCTION",
    "ADJUSTMENT_IN",
    "TRANSFER_IN",
  ]);

const CANONICAL_OUTBOUND_TYPES =
  Object.freeze([
    "SALE",
    "CONSUMPTION",
    "WASTE",
    "ADJUSTMENT_OUT",
    "TRANSFER_OUT",
    "BATCH_PRODUCTION",
  ]);

const LEGACY_INBOUND_TYPES =
  Object.freeze([
    "PUTAWAY",
  ]);

const LEGACY_OUTBOUND_TYPES =
  Object.freeze([
    "USAGE",
  ]);

const CANONICAL_TYPES =
  new Set([
    ...CANONICAL_INBOUND_TYPES,
    ...CANONICAL_OUTBOUND_TYPES,
  ]);

const INBOUND_TYPES =
  new Set([
    ...CANONICAL_INBOUND_TYPES,
    ...LEGACY_INBOUND_TYPES,
  ]);

const OUTBOUND_TYPES =
  new Set([
    ...CANONICAL_OUTBOUND_TYPES,
    ...LEGACY_OUTBOUND_TYPES,
  ]);

export function normalizeInventoryMovementType(
  value
) {
  return String(
    value || ""
  )
    .trim()
    .toUpperCase();
}

export function classifyInventoryMovementType(
  value
) {
  const type =
    normalizeInventoryMovementType(
      value
    );

  if (
    INBOUND_TYPES.has(
      type
    )
  ) {
    return "INBOUND";
  }

  if (
    OUTBOUND_TYPES.has(
      type
    )
  ) {
    return "OUTBOUND";
  }

  return "UNKNOWN";
}

export function signedInventoryQuantity(
  type,
  quantity
) {
  const numericQuantity =
    Number(
      quantity || 0
    );

  const classification =
    classifyInventoryMovementType(
      type
    );

  if (
    classification ===
    "INBOUND"
  ) {
    return numericQuantity;
  }

  if (
    classification ===
    "OUTBOUND"
  ) {
    return -numericQuantity;
  }

  return 0;
}

export function assertCanonicalInventoryMovementType(
  value
) {
  const type =
    normalizeInventoryMovementType(
      value
    );

  if (!type) {
    throw new Error(
      "movementType required"
    );
  }

  if (
    !CANONICAL_TYPES.has(
      type
    )
  ) {
    throw new Error(
      `Unsupported inventory movement type: ${type}`
    );
  }

  return type;
}

export {
  CANONICAL_INBOUND_TYPES,
  CANONICAL_OUTBOUND_TYPES,
  LEGACY_INBOUND_TYPES,
  LEGACY_OUTBOUND_TYPES,
};
