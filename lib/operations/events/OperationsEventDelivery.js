function requireClient(client) {
  if (!client || typeof client.rpc !== "function" || typeof client.from !== "function") {
    throw new Error("Operations event delivery requires a Supabase client.");
  }

  return client;
}

export function createOperationsEventDelivery({
  client,
  rpcName = "publish_operations_event_batch",
  healthRpcName = "get_operations_event_delivery_health",
  retryRpcName = "retry_operations_dead_letter",
  eventsTable = "operations_events",
  outboxTable = "operations_event_outbox",
}) {
  const database = requireClient(client);

  async function publishPending({ organizationId = null, limit = 100 } = {}) {
    const { data, error } = await database.rpc(rpcName, {
      p_organization_id: organizationId || null,
      p_limit: limit,
    });

    if (error) throw error;
    return data || { ok: true, published: 0, failed: 0, dead_letter: 0 };
  }

  async function listEvents({
    context,
    capabilityId = null,
    aggregateId = null,
    actorId = null,
    limit = 200,
  }) {
    let query = database
      .from(eventsTable)
      .select("*")
      .eq("organization_id", context.organization_id)
      .order("occurred_at", { ascending: false })
      .limit(Math.max(1, Math.min(Number(limit) || 200, 500)));

    query = context.entity_id == null
      ? query.is("entity_id", null)
      : query.eq("entity_id", context.entity_id);

    query = context.period_id == null
      ? query.is("period_id", null)
      : query.eq("period_id", context.period_id);

    if (capabilityId) query = query.eq("capability_id", capabilityId);
    if (aggregateId) query = query.eq("aggregate_id", aggregateId);
    if (actorId) query = query.eq("actor_id", actorId);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function getOutboxHealth({ context, deadLetterLimit = 50 }) {
    const { data, error } = await database.rpc(healthRpcName, {
      p_organization_id: context.organization_id,
      p_entity_id: context.entity_id || null,
      p_period_id: context.period_id || null,
      p_dead_letter_limit: Math.max(1, Math.min(Number(deadLetterLimit) || 50, 200)),
    });

    if (error) throw error;
    return data || { ok: true, health: {}, dead_letters: [] };
  }

  async function retryDeadLetter({ context, outboxId }) {
    const { data, error } = await database.rpc(retryRpcName, {
      p_organization_id: context.organization_id,
      p_entity_id: context.entity_id || null,
      p_period_id: context.period_id || null,
      p_outbox_id: outboxId,
    });

    if (error) throw error;
    return data || { ok: true, outbox_id: outboxId, status: "retry" };
  }

  return Object.freeze({
    publishPending,
    listEvents,
    getOutboxHealth,
    retryDeadLetter,
    rpcName,
    healthRpcName,
    retryRpcName,
    eventsTable,
    outboxTable,
  });
}

export default createOperationsEventDelivery;
