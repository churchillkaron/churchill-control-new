import {
  OPERATIONS_CAPABILITY_CATALOG,
  getOperationsCapability,
} from "./OperationsCapabilityCatalog";

function assertBusinessContext(context) {
  if (!context || typeof context !== "object") {
    throw new Error("Operations runtime requires a business context.");
  }

  if (!context.organization_id) {
    throw new Error("Operations runtime requires organization_id.");
  }
}

function createEventPublisher({ context, publishEvent }) {
  return async function publishOperationalEvent(event, execution = {}) {
    if (!event || typeof event !== "object") {
      throw new Error("Operational events must be objects.");
    }

    const envelope = {
      domain: "operations",
      organization_id: context.organization_id,
      entity_id: context.entity_id || null,
      period_id: context.period_id || null,
      occurred_at: event.occurred_at || new Date().toISOString(),
      command_record_id: execution.commandRecord?.id || null,
      ...event,
    };

    if (typeof publishEvent === "function") {
      await publishEvent({
        event: envelope,
        transaction: execution.transaction || null,
      });
    }

    return envelope;
  };
}

function createCapabilityRuntime({
  capability,
  context,
  handlers,
  repositories,
  commandExecution,
  publishOperationalEvent,
}) {
  const capabilityHandlers = handlers?.[capability.id] || {};
  const repository = repositories?.get?.(capability.id)
    || repositories?.repositories?.[capability.id]
    || repositories?.[capability.id]
    || null;

  function supports(command) {
    return capability.commands.includes(command);
  }

  async function execute(command, payload = {}) {
    if (capability.readOnly) {
      throw new Error(`${capability.name} is read-only.`);
    }

    if (!supports(command)) {
      throw new Error(
        `Unsupported Operations command: ${capability.id}.${command}`,
      );
    }

    const handler = capabilityHandlers[command];

    if (typeof handler !== "function") {
      throw new Error(
        `No handler registered for Operations command: ${capability.id}.${command}`,
      );
    }

    if (commandExecution?.execute) {
      const execution = await commandExecution.execute({
        context,
        capability,
        command,
        payload,
        publishEvent: publishOperationalEvent,
        handler: async (executionContext) => handler({
          ...executionContext,
          repository,
          publishEvent: (event) => publishOperationalEvent(event, {
            transaction: executionContext.transaction,
            commandRecord: executionContext.commandRecord,
          }),
        }),
      });

      return {
        capability_id: capability.id,
        command,
        durable: true,
        ...execution,
      };
    }

    const result = await handler({
      context,
      payload,
      capability,
      command,
      repository,
      transaction: null,
      commandRecord: null,
      publishEvent: (event) => publishOperationalEvent(event),
    });

    return {
      capability_id: capability.id,
      command,
      result,
      durable: false,
      idempotent_replay: false,
    };
  }

  return Object.freeze({
    ...capability,
    repository,
    supports,
    execute,
  });
}

export function buildOperationsRuntime(
  context = {},
  {
    handlers = {},
    repositories = null,
    commandExecution = null,
    publishEvent = null,
  } = {},
) {
  assertBusinessContext(context);

  const publishOperationalEvent = createEventPublisher({
    context,
    publishEvent,
  });
  const capabilities = Object.freeze(
    Object.fromEntries(
      OPERATIONS_CAPABILITY_CATALOG.map((capability) => [
        capability.id,
        createCapabilityRuntime({
          capability,
          context,
          handlers,
          repositories,
          commandExecution,
          publishOperationalEvent,
        }),
      ]),
    ),
  );

  function getCapability(capabilityId) {
    return capabilities[capabilityId] || null;
  }

  function requireCapability(capabilityId) {
    const capability = getCapability(capabilityId);

    if (!capability) {
      throw new Error(`Unknown Operations capability: ${capabilityId}`);
    }

    return capability;
  }

  async function execute(capabilityId, command, payload = {}) {
    return requireCapability(capabilityId).execute(command, payload);
  }

  return Object.freeze({
    domain: "operations",
    durable: Boolean(commandExecution?.execute),
    context: Object.freeze({ ...context }),
    catalogue: OPERATIONS_CAPABILITY_CATALOG,
    capabilities,
    repositories,
    getCapability,
    requireCapability,
    execute,
    publishEvent: publishOperationalEvent,

    // Backward-compatible aliases while callers converge on capabilities.
    tasks: capabilities["work-items"],
    dispatch: capabilities.dispatch,
    incidents: capabilities.incidents,
    activities: capabilities.activities,
    checklists: capabilities.checklists,
  });
}

export { getOperationsCapability };

export default buildOperationsRuntime;
