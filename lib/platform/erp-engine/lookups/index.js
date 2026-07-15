import {
  registerLookup,
} from "./LookupRegistry";

import {
  getLookupOptions,
} from "./LookupRuntime";

import AccountTypeLookup
from "./providers/AccountTypeLookup";

registerLookup(
  "account-types",
  AccountTypeLookup,
);

export async function loadLookup({

  lookup,

  organizationId,

  entityId,

  query = "",

}) {

  return getLookupOptions({

    lookup,

    query,

    context: {

      organizationId,

      entityId,

    },

  });

}

export * from "./LookupRuntime";
export * from "./LookupRegistry";
