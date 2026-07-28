function requireClient(client) {
  if (!client || typeof client.rpc !== "function" || typeof client.from !== "function") {
    throw new Error("Operations event delivery requires a Supabase client.");
  }

  return client;
}

export function createOperationsEventDelivery({
  client,
  rpcName = "publish_operations_event_batch",
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

  async function getOutboxHealth({ organizationId = null } = {}) {
    let query = database
      .from(outboxTable)
      .select("status, attempts")
      .limit(5000);

    if (organizationId) query = query.eq("organization_id", organizationId);

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).reduce((health, row) => {
      const status = row.status || "unknown";
      health.total += 1;
      health.by_status[status] = (health.by_status[status] || 0) + 1;
      health.max_attempts = Math.max(health.max_attempts, Number(row.attempts || 0));
      return health;
    }, {
      total: 0,
      by_status: {},
      max_attempts: 0,
    });
  }

  return Object.freeze({
    publishPending,
    listEvents,
    getOutboxHealth,
    rpcName,
    eventsTable,
    outboxTable,
  });
}

export default createOperationsEventDelivery;
