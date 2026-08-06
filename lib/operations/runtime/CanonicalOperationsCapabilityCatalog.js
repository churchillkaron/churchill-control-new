import {
  OPERATIONS_CAPABILITY_CATALOG,
} from "@/lib/operations/runtime/OperationsCapabilityCatalog";
import {
  OPERATIONS_COMMERCE_CAPABILITY_CATALOG,
} from "@/lib/operations/runtime/CommerceCapabilityCatalog";

const capabilityEntries = [
  ...OPERATIONS_CAPABILITY_CATALOG,
  ...OPERATIONS_COMMERCE_CAPABILITY_CATALOG,
];

const duplicateIds = capabilityEntries
  .map((capability) => capability.id)
  .filter((id, index, values) => values.indexOf(id) !== index);

if (duplicateIds.length) {
  throw new Error(
    `Duplicate Operations capability ids: ${[...new Set(duplicateIds)].join(", ")}`
  );
}

export const CANONICAL_OPERATIONS_CAPABILITY_CATALOG = Object.freeze(
  capabilityEntries
);

const CAPABILITY_BY_ID = Object.freeze(
  Object.fromEntries(
    CANONICAL_OPERATIONS_CAPABILITY_CATALOG.map((capability) => [
      capability.id,
      capability,
    ])
  )
);

export function getCanonicalOperationsCapability(capabilityId) {
  return CAPABILITY_BY_ID[String(capabilityId || "").trim()] || null;
}

export function getCanonicalOperationsCapabilitiesByGroup(groupId) {
  return CANONICAL_OPERATIONS_CAPABILITY_CATALOG.filter(
    (capability) => capability.group === groupId
  );
}

export default CANONICAL_OPERATIONS_CAPABILITY_CATALOG;
