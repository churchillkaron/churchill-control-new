import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import { createOperationsApiController } from "./OperationsApiController";
import { createCanonicalOperationsRepositories } from "../repositories/CanonicalOperationsRepositories";
import { createCanonicalOperationsHandlers } from "../runtime/CanonicalOperationsHandlers";
import { buildOperationsRuntime } from "../runtime/OperationsRuntime";
import { createOperationsOutbox } from "../runtime/OperationsPersistenceContracts";

const repositories = createCanonicalOperationsRepositories({
  client: supabaseAdmin,
});

const handlers = createCanonicalOperationsHandlers();
const outbox = createOperationsOutbox({
  client: supabaseAdmin,
});

function buildRuntime(context) {
  return buildOperationsRuntime(context, {
    handlers,
    repositories,
    publishEvent: ({ event, transaction = null }) => outbox.enqueue({
      event,
      transaction,
    }),
  });
}

export const serverOperationsApi = createOperationsApiController({
  repositories,
  buildRuntime,
});

export default serverOperationsApi;
