import {
  createExecutionContext,
} from "./context/createExecutionContext";

import {
  loadCapability,
} from "./loaders/CapabilityLoader";

import {
  runValidation,
} from "./engines/ValidationEngine";

import {
  runAuthorization,
} from "./engines/AuthorizationEngine";

import {
  beginTransaction,
  commitTransaction,
  rollbackTransaction,
} from "./engines/TransactionEngine";

import {
  publishEvents,
} from "./engines/EventEngine";

import {
  runAIHooks,
} from "./engines/AIEngine";

import {
  writeAuditLog,
} from "./engines/AuditEngine";

export async function execute({
  organizationId,
  domain,
  capability,
  action,
  payload = {},
  actor = null,
  runtime = {},
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!domain) {
    throw new Error("domain required");
  }

  if (!capability) {
    throw new Error("capability required");
  }

  if (!action) {
    throw new Error("action required");
  }

  const context =
    createExecutionContext({
      organizationId,
      actor,
      ...runtime,
    });

  const loaded =
    await loadCapability({
      domain,
      capability,
      action,
    });

  let transaction = null;

  try {
    await runValidation({
      capabilityModule:
        loaded.module,
      context,
      payload,
    });

    await runAuthorization({
      capabilityModule:
        loaded.module,
      context,
      payload,
    });

    transaction =
      await beginTransaction({
        context,
        domain,
        capability,
        action,
      });

    const result =
      await loaded.execute({
        context,
        payload,
      });

    await publishEvents({
      capabilityModule:
        loaded.module,
      context,
      payload,
      result,
    });

    await runAIHooks({
      capabilityModule:
        loaded.module,
      context,
      payload,
      result,
    });

    await writeAuditLog({
      context,
      domain,
      capability,
      action,
      result,
    });

    await commitTransaction({
      transaction,
      result,
    });

    return {
      success: true,
      context: {
        organizationId:
          context.organizationId,
        requestId:
          context.requestId,
        correlationId:
          context.correlationId,
      },
      domain,
      capability,
      action,
      result,
    };
  } catch (error) {
    await rollbackTransaction({
      transaction,
      error,
    });

    throw error;
  }
}
