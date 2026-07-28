function requireClient(client) {
  if (!client || typeof client.from !== "function") {
    throw new Error("Operations persistence requires a database client.");
  }

  return client;
}

function resolveClient(client, transaction) {
  return transaction || client;
}

export function createOperationsCommandLedger({
  client,
  table = "operations_command_ledger",
}) {
  requireClient(client);

  async function findCompleted({
    organization_id,
    entity_id = null,
    command_key,
    transaction = null,
  }) {
    const db = resolveClient(client, transaction);
    let query = db
      .from(table)
      .select("id, command_key, result, completed_at")
      .eq("organization_id", organization_id)
      .eq("command_key", command_key)
      .eq("status", "completed");

    query = entity_id == null
      ? query.is("entity_id", null)
      : query.eq("entity_id", entity_id);

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw error;
    }

    return data || null;
  }

  async function begin({ transaction = null, ...values }) {
    const db = resolveClient(client, transaction);
    const { data, error } = await db
      .from(table)
      .insert({
        ...values,
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async function complete({ command_record, result, transaction = null }) {
    const db = resolveClient(client, transaction);
    const { data, error } = await db
      .from(table)
      .update({
        status: "completed",
        result,
        completed_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", command_record.id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async function fail({ command_record, error: failure, transaction = null }) {
    const db = resolveClient(client, transaction);
    const { data, error } = await db
      .from(table)
      .update({
        status: "failed",
        error: failure,
        failed_at: new Date().toISOString(),
      })
      .eq("id", command_record.id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  return Object.freeze({
    findCompleted,
    begin,
    complete,
    fail,
  });
}

export function createOperationsOutbox({
  client,
  table = "operations_event_outbox",
}) {
  requireClient(client);

  async function enqueue({ event, transaction = null }) {
    const db = resolveClient(client, transaction);
    const { data, error } = await db
      .from(table)
      .insert({
        organization_id: event.organization_id,
        entity_id: event.entity_id || null,
        period_id: event.period_id || null,
        domain: "operations",
        event_type: event.type || event.event_type,
        aggregate_type: event.aggregate_type || null,
        aggregate_id: event.aggregate_id || null,
        payload: event,
        status: "pending",
        occurred_at: event.occurred_at,
      })
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  return Object.freeze({ enqueue });
}

export function createOperationsTransaction({ run }) {
  if (typeof run !== "function") {
    throw new Error("Operations transaction contract requires run.");
  }

  return async function transaction(work) {
    if (typeof work !== "function") {
      throw new Error("Operations transaction requires a work function.");
    }

    return run(work);
  };
}
