import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import { createOperationsApiController } from "./OperationsApiController";
import { createCanonicalOperationsRepositories } from "../repositories/CanonicalOperationsRepositories";
import { createCanonicalOperationsHandlers } from "../runtime/CanonicalOperationsHandlers";
import { createAtomicOperationsCommandExecution } from "../runtime/AtomicOperationsCommandExecution";
import { buildOperationsRuntime } from "../runtime/OperationsRuntime";

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

export const serverOperationsApi = createOperationsApiController({
  repositories,
  buildRuntime,
});

export default serverOperationsApi;
