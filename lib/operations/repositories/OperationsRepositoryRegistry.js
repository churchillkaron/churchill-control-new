import {
  OPERATIONS_CAPABILITY_CATALOG,
} from "../runtime/OperationsCapabilityCatalog";

const REQUIRED_METHODS = Object.freeze([
  "list",
  "getById",
  "create",
  "update",
  "transition",
]);

function requireRepositoryMethod(repository, capabilityId, method) {
  if (typeof repository?.[method] !== "function") {
    throw new Error(
      `Operations repository ${capabilityId} requires method ${method}.`,
    );
  }
}

function validateRepository(capability, repository) {
  if (!repository || typeof repository !== "object") {
    throw new Error(
      `Operations repository missing for capability: ${capability.id}`,
    );
  }

  for (const method of REQUIRED_METHODS) {
    if (capability.readOnly && ["create", "update", "transition"].includes(method)) {
      continue;
    }

    requireRepositoryMethod(repository, capability.id, method);
  }

  return Object.freeze(repository);
}

export function createOperationsRepositoryRegistry(repositories = {}) {
  const registered = Object.fromEntries(
    OPERATIONS_CAPABILITY_CATALOG.map((capability) => [
      capability.id,
      validateRepository(capability, repositories[capability.id]),
    ]),
  );

  function get(capabilityId) {
    return registered[capabilityId] || null;
  }

  function require(capabilityId) {
    const repository = get(capabilityId);

    if (!repository) {
      throw new Error(`Unknown Operations repository: ${capabilityId}`);
    }

    return repository;
  }

  return Object.freeze({
    repositories: Object.freeze(registered),
    get,
    require,
  });
}

export function createScopedOperationsRepository({
  capabilityId,
  table,
  client,
}) {
  if (!capabilityId || !table || !client) {
    throw new Error(
      "Scoped Operations repository requires capabilityId, table and client.",
    );
  }

  function scope(query, context) {
    if (!context?.organization_id) {
      throw new Error("Operations repository requires organization_id.");
    }

    let scoped = query
      .eq("organization_id", context.organization_id)
      .eq("capability_id", capabilityId);

    scoped = context.entity_id
      ? scoped.eq("entity_id", context.entity_id)
      : scoped.is("entity_id", null);

    scoped = context.period_id
      ? scoped.eq("period_id", context.period_id)
      : scoped.is("period_id", null);

    return scoped;
  }

  function sanitizeWriteValues(values = {}) {
    const {
      organization_id,
      entity_id,
      period_id,
      capability_id,
      ...safeValues
    } = values;

    return safeValues;
  }

  async function list({ context, filters = {}, transaction = null }) {
    const db = transaction || client;
    let query = scope(db.from(table).select("*"), context);

    for (const [key, value] of Object.entries(filters)) {
      if (
        ["organization_id", "entity_id", "period_id", "capability_id"].includes(key)
      ) {
        continue;
      }

      if (value !== undefined && value !== null && value !== "") {
        query = query.eq(key, value);
      }
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async function getById({ context, id, transaction = null }) {
    const db = transaction || client;
    const { data, error } = await scope(
      db.from(table).select("*").eq("id", id),
      context,
    ).maybeSingle();

    if (error) throw error;
    return data || null;
  }

  async function create({ context, values, transaction = null }) {
    const db = transaction || client;
    const payload = {
      ...sanitizeWriteValues(values),
      organization_id: context.organization_id,
      entity_id: context.entity_id || null,
      period_id: context.period_id || null,
      capability_id: capabilityId,
    };
    const { data, error } = await db
      .from(table)
      .insert(payload)
      .select("*")
      .single();

    if (error) throw error;
    return data;
  }

  async function update({ context, id, values, transaction = null }) {
    const db = transaction || client;
    const { data, error } = await scope(
      db.from(table).update(sanitizeWriteValues(values)).eq("id", id),
      context,
    )
      .select("*")
      .single();

    if (error) throw error;
    return data;
  }

  async function transition({
    context,
    id,
    command,
    values = {},
    transaction = null,
  }) {
    return update({
      context,
      id,
      transaction,
      values: {
        ...sanitizeWriteValues(values),
        status: command,
        last_command: command,
        updated_at: new Date().toISOString(),
      },
    });
  }

  return Object.freeze({
    capabilityId,
    table,
    list,
    getById,
    create,
    update,
    transition,
  });
}

export default createOperationsRepositoryRegistry;
