import {
  getOperationsCapability,
} from "../runtime/OperationsCapabilityCatalog";

function requireContext(context) {
  if (!context?.organization_id) {
    const error = new Error("Operations API requires organization_id.");
    error.status = 400;
    throw error;
  }

  return context;
}

function requireCapability(capabilityId) {
  const capability = getOperationsCapability(capabilityId);

  if (!capability) {
    const error = new Error(`Unknown Operations capability: ${capabilityId}`);
    error.status = 404;
    throw error;
  }

  return capability;
}

function requireRepository(repositories, capabilityId) {
  const repository = repositories?.require?.(capabilityId)
    || repositories?.get?.(capabilityId)
    || repositories?.repositories?.[capabilityId]
    || repositories?.[capabilityId]
    || null;

  if (!repository) {
    const error = new Error(`Operations repository unavailable: ${capabilityId}`);
    error.status = 500;
    throw error;
  }

  return repository;
}

function normaliseFilters(filters = {}) {
  const blocked = new Set([
    "organization_id",
    "entity_id",
    "period_id",
    "capability_id",
  ]);

  return Object.fromEntries(
    Object.entries(filters).filter(([key, value]) => (
      !blocked.has(key)
      && value !== undefined
      && value !== null
      && value !== ""
    )),
  );
}

function inferErrorStatus(error) {
  if (Number.isInteger(error?.status)) {
    return error.status;
  }

  const message = String(error?.message || "");

  if (/not found/i.test(message)) return 404;
  if (/read-only/i.test(message)) return 405;
  if (
    /requires|unsupported|unknown|invalid|must|missing|idempotency|source\/source_id/i.test(message)
  ) {
    return 400;
  }

  return 500;
}

function normaliseError(error) {
  return {
    status: inferErrorStatus(error),
    body: {
      ok: false,
      error: error?.message || "Operations request failed.",
    },
  };
}

export function createOperationsApiController({
  repositories,
  buildRuntime,
}) {
  if (!repositories) {
    throw new Error("Operations API controller requires repositories.");
  }

  if (typeof buildRuntime !== "function") {
    throw new Error("Operations API controller requires buildRuntime.");
  }

  async function list({ capabilityId, context, filters = {} }) {
    try {
      requireContext(context);
      const capability = requireCapability(capabilityId);
      const repository = requireRepository(repositories, capability.id);
      const rows = await repository.list({
        context,
        filters: normaliseFilters(filters),
      });

      return {
        status: 200,
        body: {
          ok: true,
          capability,
          rows,
          count: rows.length,
        },
      };
    } catch (error) {
      return normaliseError(error);
    }
  }

  async function detail({ capabilityId, id, context }) {
    try {
      requireContext(context);
      const capability = requireCapability(capabilityId);

      if (!id) {
        const error = new Error("Operations detail request requires id.");
        error.status = 400;
        throw error;
      }

      const repository = requireRepository(repositories, capability.id);
      const record = await repository.getById({ context, id });

      if (!record) {
        const error = new Error(`${capability.name} record not found.`);
        error.status = 404;
        throw error;
      }

      return {
        status: 200,
        body: {
          ok: true,
          capability,
          record,
        },
      };
    } catch (error) {
      return normaliseError(error);
    }
  }

  async function execute({
    capabilityId,
    command,
    context,
    payload = {},
  }) {
    try {
      requireContext(context);
      const capability = requireCapability(capabilityId);

      if (!command) {
        const error = new Error("Operations command request requires command.");
        error.status = 400;
        throw error;
      }

      if (capability.readOnly) {
        const error = new Error(`${capability.name} is read-only.`);
        error.status = 405;
        throw error;
      }

      if (!capability.commands.includes(command)) {
        const error = new Error(
          `Unsupported Operations command: ${capability.id}.${command}`,
        );
        error.status = 400;
        throw error;
      }

      const runtime = buildRuntime(context);
      const execution = await runtime.execute(
        capability.id,
        command,
        payload,
      );

      return {
        status: 200,
        body: {
          ok: true,
          capability_id: capability.id,
          command,
          execution,
        },
      };
    } catch (error) {
      return normaliseError(error);
    }
  }

  return Object.freeze({
    list,
    detail,
    execute,
  });
}

export default createOperationsApiController;
