import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import { createOperationsApiController } from "./OperationsApiController";
import { createCanonicalOperationsRepositories } from "../repositories/CanonicalOperationsRepositories";
import { createCanonicalOperationsHandlers } from "../runtime/CanonicalOperationsHandlers";
import { createAtomicOperationsCommandExecution } from "../runtime/AtomicOperationsCommandExecution";
import { buildOperationsRuntime } from "../runtime/OperationsRuntime";

let controller = null;

function getController() {
  if (controller) return controller;

  const repositories = createCanonicalOperationsRepositories({
    client: supabaseAdmin,
  });
  const handlers = createCanonicalOperationsHandlers();
  const commandExecution = createAtomicOperationsCommandExecution({
    client: supabaseAdmin,
  });
  function buildRuntime(context) {
    return buildOperationsRuntime(context, {
      handlers,
      repositories,
      commandExecution,
    });
  }

  controller = createOperationsApiController({
    repositories,
    buildRuntime,
  });
  return controller;
}

export const serverOperationsApi = Object.freeze({
  list(...args) {
    return getController().list(...args);
  },
  detail(...args) {
    return getController().detail(...args);
  },
  create(...args) {
    return getController().create(...args);
  },
  execute(...args) {
    return getController().execute(...args);
  },
});

export default serverOperationsApi;
