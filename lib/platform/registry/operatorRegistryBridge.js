import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";

// The ERP registry already declares every workspace the UI renders, including the
// list API each one reads and the create action each one offers. That makes it the
// one declarative source broad enough to let the Operator see the whole system, so
// capabilities are generated from it rather than hand written per domain. Adding a
// registry item makes it conversational with no code change.
//
// Only items that can actually execute are exposed. A create is skipped unless it
// names a real capability and action: 28 of the 39 declared creates resolve to
// "undefined.undefined", which are workspace buttons with no implementation
// behind them, and offering those would mean confidently failing on every call.

function text(value) {
  return String(value ?? "").trim();
}

function ubteName(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function listEndpoint(item) {
  return text(item?.ui?.api || item?.runtime?.listApi) || null;
}

function rowsKey(item) {
  return text(item?.ui?.rowsKey || item?.runtime?.rowsKey) || null;
}

function boundCreate(item) {
  const create = item?.create;
  if (!create || create.enabled === false) return null;

  const capability = ubteName(create.capability);
  const action = text(create.action);

  if (!capability || !action || capability === "undefined" || action === "undefined") {
    return null;
  }

  return { capability, action, api: text(create.api) || null, label: text(create.label) || null };
}

function readDescription(domain, item) {
  const base = text(item.description);
  const name = text(item.name) || item.id;
  return base
    ? `Read ${name} in ${domain}. ${base}`
    : `Read ${name} records in ${domain}.`;
}

function callerOrigin(context) {
  const request = context?.callerRequest;
  if (!request?.url) return null;

  try {
    return new URL(request.url).origin;
  } catch {
    return null;
  }
}

function callerCookie(context) {
  try {
    return context?.callerRequest?.headers?.get?.("cookie") || null;
  } catch {
    return null;
  }
}

function readFilters(payload = {}) {
  const filters = {};

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null || value === "") continue;
    if (["organizationId", "organization_id", "entityId", "entity_id", "periodId", "period_id", "partyId", "party_id"].includes(key)) {
      continue;
    }
    if (typeof value === "object") continue;
    filters[key] = String(value);
  }

  return filters;
}

export function createRegistryReadCapability({ domain, item }) {
  const endpoint = listEndpoint(item);
  const key = rowsKey(item);

  const manifest = defineCapability({
    domain: ubteName(domain),
    capability: ubteName(item.id),
    action: "read",
    description: readDescription(domain, item),
    permissions: [],
    events: [],
    tags: [ubteName(domain), ubteName(item.id), "registry", "read"],
    transactional: false,
    aiEnabled: false,
    operatorEnabled: true,
    operatorMode: "read",
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    risk: "low",
    registryRoute: text(item.route) || null,
    registryEndpoint: endpoint,
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: true,
    },
  });

  async function execute({ context, payload = {} }) {
    const origin = callerOrigin(context);

    if (!origin) {
      const error = new Error(
        `${item.name || item.id} cannot be read without the caller request context.`,
      );
      error.status = 500;
      throw error;
    }

    const url = new URL(endpoint, origin);
    url.searchParams.set("organizationId", context.organizationId);
    if (context.entityId) url.searchParams.set("entityId", context.entityId);
    if (context.periodId) url.searchParams.set("periodId", context.periodId);

    for (const [name, value] of Object.entries(readFilters(payload))) {
      url.searchParams.set(name, value);
    }

    const cookie = callerCookie(context);

    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(cookie ? { cookie } : {}),
      },
    });

    const body = await response.json().catch(() => null);

    if (!response.ok || body?.success === false) {
      const error = new Error(
        body?.error || `${item.name || item.id} could not be read.`,
      );
      error.status = response.status;
      throw error;
    }

    const rows = key && Array.isArray(body?.[key]) ? body[key] : body;

    return { source: endpoint, rows_key: key, data: rows };
  }

  return { manifest, execute };
}

export function createRegistryCreateCapability({ domain, item }) {
  const endpoint = text(item?.create?.api);
  const label = text(item?.create?.label) || text(item?.create?.title) || text(item.name);

  const manifest = defineCapability({
    domain: ubteName(domain),
    capability: ubteName(item.id),
    action: "create",
    description:
      `Create ${label || item.id} in ${domain}. ${text(item.description)}`.trim(),
    // Derived rather than blank: a write with no declared permission would be
    // usable by anyone the Operator serves. This keeps it to holders of the
    // matching permission, and to full-access roles.
    permissions: [`${ubteName(domain)}.${ubteName(item.id)}.create`],
    events: [],
    tags: [ubteName(domain), ubteName(item.id), "registry", "write"],
    transactional: true,
    aiEnabled: false,
    operatorEnabled: true,
    operatorMode: "write",
    operatorAutoExecute: false,
    operatorRequiresConfirmation: true,
    risk: "medium",
    registryRoute: text(item.route) || null,
    registryEndpoint: endpoint,
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: true,
    },
  });

  async function execute({ context, payload = {} }) {
    const origin = callerOrigin(context);

    if (!origin) {
      const error = new Error(
        `${label || item.id} cannot be created without the caller request context.`,
      );
      error.status = 500;
      throw error;
    }

    const cookie = callerCookie(context);

    const response = await fetch(new URL(endpoint, origin), {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify({
        ...payload,
        organizationId: context.organizationId,
        organization_id: context.organizationId,
        ...(context.entityId
          ? { entityId: context.entityId, entity_id: context.entityId }
          : {}),
      }),
    });

    const body = await response.json().catch(() => null);

    if (response.status === 404 || response.status === 405) {
      const error = new Error(
        `Creating ${label || item.id} is declared but not implemented yet.`,
      );
      error.status = 501;
      throw error;
    }

    if (!response.ok || body?.success === false) {
      const error = new Error(
        body?.error || `${label || item.id} could not be created.`,
      );
      error.status = response.status;
      throw error;
    }

    return body;
  }

  return { manifest, execute };
}

export function buildOperatorRegistryCapabilities(registry) {
  const workspaces = registry?.workspaces || {};
  const domains = {};
  const skippedCreates = [];

  for (const [domain, workspace] of Object.entries(workspaces)) {
    const domainKey = ubteName(domain);

    for (const group of workspace?.groups || []) {
      for (const item of group?.items || []) {
        if (!item?.id) continue;

        const endpoint = listEndpoint(item);
        const create = boundCreate(item);

        if (!endpoint && !create) continue;

        domains[domainKey] = domains[domainKey] || {};
        const capabilityKey = ubteName(item.id);
        domains[domainKey][capabilityKey] = domains[domainKey][capabilityKey] || {};

        if (endpoint) {
          let cached;
          domains[domainKey][capabilityKey].read = async () => {
            if (!cached) cached = createRegistryReadCapability({ domain, item });
            return cached;
          };
        }

        // A create is generated whenever the registry gives an endpoint to call.
        // Items whose create names a real UBTE capability are left to that
        // implementation, and items with neither are recorded rather than offered.
        if (item?.create?.enabled) {
          const createEndpoint = text(item.create.api);

          // Generated whenever an endpoint exists, even when the item also names a
          // UBTE capability: nine of those named capabilities are not implemented,
          // and the generated action has its own name so a real implementation is
          // never shadowed.
          if (createEndpoint) {
            let cachedCreate;
            domains[domainKey][capabilityKey].create = async () => {
              if (!cachedCreate) {
                cachedCreate = createRegistryCreateCapability({ domain, item });
              }
              return cachedCreate;
            };
          } else if (!create && !createEndpoint) {
            skippedCreates.push(`${domain}.${item.id}`);
          }
        }
      }
    }
  }

  return { capabilities: domains, skippedCreates };
}

export default buildOperatorRegistryCapabilities;
