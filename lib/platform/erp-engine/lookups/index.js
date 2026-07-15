import {
  registerLookup,
} from "./LookupRegistry";

import AccountTypeLookup
from "./providers/AccountTypeLookup";

registerLookup(
  "account-types",
  AccountTypeLookup,
);

export * from "./LookupRuntime";
export * from "./LookupRegistry";
