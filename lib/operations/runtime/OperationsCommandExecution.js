function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new Error(`Operations command execution requires ${name}.`);
  }

  return value;
}

function requireText(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Operations command execution requires ${name}.`);
  }

  return value.trim();
}

function buildCommandKey({ context, capability, command, payload }) {
  const providedKey = payload?.idempotency_key || payload?.idempotencyKey;

  if (providedKey) {
    return [
      context.organization_id,
      context.entity_id || "global",
      capability.id,
      command,
      requireText(providedKey, "a valid idempotency key"),
    ].join(":");
  }

  const source = payload?.source || payload?.metadata?.source;
  const sourceId = payload?.source_id || payload?.sourceId || payload?.metadata?.source_id;
  const sourceRevision =
    payload?.source_revision || payload?.sourceRevision || payload?.metadata?.source_revision;

  if (!source || !sourceId) {
    throw new Error(
      `Operations command ${capability.id}.${command} requires idempotency_key or source/source_id metadata.`,
    );
  }

  return [
    context.organization_id,
    context.entity_id || "global",
    capability.id,
    command,
    requireText(source, "source"),
    requireText(String(sourceId), "source_id"),
    sourceRevision == null ? "current" : requireText(String(sourceRevision), "source_revision"),
  ].join(":");
}

export function createOperationsCommandExecution({
  transaction,
  commandLedger,
}) {
  const runTransaction = requireFunction(transaction, "a transaction function");
  const ledger = commandLedger || {};
  const findCompleted = requireFunction(ledger.findCompleted, "commandLedger.findCompleted");
  const begin = requireFunction(ledger.begin, "commandLedger.begin");
  const complete = requireFunction(ledger.complete, "commandLedger.complete");
  const fail = requireFunction(ledger.fail, "commandLedger.fail");

  async function execute({
    context,
    capability,
    command,
    payload,
    handler,
    publishEvent,
  }) {
    const commandKey = buildCommandKey({ context, capability, command, payload });
    const completed = await findCompleted({
      organization_id: context.organization_id,
      entity_id: context.entity_id || null,
      command_key: commandKey,
    });

    if (completed) {
      return {
        ...completed.result,
        idempotent_replay: true,
        command_key: commandKey,
      };
    }

    return runTransaction(async (transactionContext) => {
      const commandRecord = await begin({
        organization_id: context.organization_id,
        entity_id: context.entity_id || null,
        period_id: context.period_id || null,
        capability_id: capability.id,
        command,
        command_key: commandKey,
        payload,
        transaction: transactionContext,
      });

      try {
        const result = await handler({
          context,
          payload,
          capability,
          command,
          transaction: transactionContext,
          commandRecord,
          publishEvent,
        });

        await complete({
          command_record: commandRecord,
          result,
          transaction: transactionContext,
        });

        return {
          result,
          idempotent_replay: false,
          command_key: commandKey,
          command_record_id: commandRecord?.id || null,
        };
      } catch (error) {
        await fail({
          command_record: commandRecord,
          error: {
            name: error?.name || "Error",
            message: error?.message || "Operations command failed.",
          },
          transaction: transactionContext,
        });

        throw error;
      }
    });
  }

  return Object.freeze({
    execute,
    buildCommandKey,
  });
}

export { buildCommandKey };
