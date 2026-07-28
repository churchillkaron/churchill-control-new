import {
  OPERATIONS_CAPABILITY_CATALOG,
} from "./OperationsCapabilityCatalog";

const CREATE_COMMANDS = new Set(["create", "record", "report", "raise", "set"]);
const UPDATE_COMMANDS = new Set(["update", "correct", "revise"]);

function requireRecordId(payload, capabilityId, command) {
  const id = payload?.id || payload?.record_id;

  if (!id) {
    throw new Error(
      `Operations command ${capabilityId}.${command} requires id or record_id.`,
    );
  }

  return id;
}

function sanitizeValues(payload = {}) {
  const {
    id,
    record_id,
    command_key,
    idempotency_key,
    ...values
  } = payload;

  return values;
}

function buildEvent({ capability, command, record, payload }) {
  return {
    event_type: `operations.${capability.id}.${command}`,
    capability_id: capability.id,
    aggregate_type: capability.recordType,
    aggregate_id: record?.id || payload?.id || payload?.record_id || null,
    payload: {
      command,
      status: record?.status || null,
      record,
    },
  };
}

function createCommandHandler(capability, command) {
  if (CREATE_COMMANDS.has(command)) {
    return async ({ context, payload, repository, transaction, publishEvent }) => {
      if (!repository?.create) {
        throw new Error(`No create repository for ${capability.id}.`);
      }

      const values = sanitizeValues(payload);
      const record = await repository.create({
        context,
        values: {
          ...values,
          record_type: values.record_type || capability.recordType,
          status: values.status || "draft",
          last_command: command,
        },
        transaction,
      });

      await publishEvent(buildEvent({ capability, command, record, payload }));
      return record;
    };
  }

  if (UPDATE_COMMANDS.has(command)) {
    return async ({ context, payload, repository, transaction, publishEvent }) => {
      const id = requireRecordId(payload, capability.id, command);
      const record = await repository.update({
        context,
        id,
        values: {
          ...sanitizeValues(payload),
          last_command: command,
          updated_at: new Date().toISOString(),
        },
        transaction,
      });

      await publishEvent(buildEvent({ capability, command, record, payload }));
      return record;
    };
  }

  return async ({ context, payload, repository, transaction, publishEvent }) => {
    const id = requireRecordId(payload, capability.id, command);
    const record = await repository.transition({
      context,
      id,
      command,
      values: sanitizeValues(payload),
      transaction,
    });

    await publishEvent(buildEvent({ capability, command, record, payload }));
    return record;
  };
}

export function createCanonicalOperationsHandlers() {
  return Object.freeze(
    Object.fromEntries(
      OPERATIONS_CAPABILITY_CATALOG.map((capability) => {
        if (capability.readOnly) {
          return [capability.id, Object.freeze({})];
        }

        const handlers = Object.fromEntries(
          capability.commands.map((command) => [
            command,
            createCommandHandler(capability, command),
          ]),
        );

        return [capability.id, Object.freeze(handlers)];
      }),
    ),
  );
}

export default createCanonicalOperationsHandlers;
