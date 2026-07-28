import { buildCommandKey } from "./OperationsCommandExecution";

function requireClient(client) {
  if (!client || typeof client.rpc !== "function") {
    throw new Error("Atomic Operations command execution requires a Supabase client.");
  }

  return client;
}

function inferStatus(result = {}) {
  const status = Number(result.status);
  return Number.isInteger(status) && status >= 400 ? status : 500;
}

function attachActor(context, payload = {}) {
  const actorId = context?.actor_id || null;

  if (!actorId) {
    return payload || {};
  }

  return {
    ...(payload || {}),
    created_by: payload?.created_by || actorId,
    updated_by: actorId,
  };
}

export function createAtomicOperationsCommandExecution({
  client,
  rpcName = "execute_operations_command",
}) {
  const database = requireClient(client);

  async function execute({
    context,
    capability,
    command,
    payload = {},
  }) {
    const commandKey = buildCommandKey({
      context,
      capability,
      command,
      payload,
    });

    const commandPayload = attachActor(context, payload);

    const { data, error } = await database.rpc(rpcName, {
      p_organization_id: context.organization_id,
      p_entity_id: context.entity_id || null,
      p_period_id: context.period_id || null,
      p_capability_id: capability.id,
      p_record_type: capability.recordType || null,
      p_command: command,
      p_command_key: commandKey,
      p_payload: commandPayload,
    });

    if (error) {
      throw error;
    }

    const result = data && typeof data === "object" ? data : {};

    if (!result.ok) {
      const executionError = new Error(
        result.error || "Atomic Operations command failed.",
      );
      executionError.status = inferStatus(result);
      executionError.details = result;
      throw executionError;
    }

    return {
      result: result.record || result.result || null,
      idempotent_replay: Boolean(result.idempotent_replay),
      command_key: result.command_key || commandKey,
      command_record_id: result.command_record_id || null,
    };
  }

  return Object.freeze({
    execute,
    buildCommandKey,
    rpcName,
  });
}

export default createAtomicOperationsCommandExecution;
