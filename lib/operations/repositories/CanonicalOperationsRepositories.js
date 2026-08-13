import {
  CANONICAL_OPERATIONS_CAPABILITY_CATALOG,
} from "../runtime/CanonicalOperationsCapabilityCatalog";
import {
  createOperationsRepositoryRegistry,
  createScopedOperationsRepository,
} from "./OperationsRepositoryRegistry";

export function createCanonicalOperationsRepositories({
  client,
  table = "operations_records",
}) {
  if (!client) {
    throw new Error("Canonical Operations repositories require a database client.");
  }

  const repositories = Object.fromEntries(
    CANONICAL_OPERATIONS_CAPABILITY_CATALOG.map((capability) => [
      capability.id,
      createScopedOperationsRepository({
        capabilityId: capability.id,
        table,
        client,
      }),
    ]),
  );

  return createOperationsRepositoryRegistry(repositories);
}

export default createCanonicalOperationsRepositories;
