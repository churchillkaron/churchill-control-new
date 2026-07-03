import { getEngine } from "@/lib/platform/engines/EngineRegistry";
import { getWorkspaceActionDefinition } from "@/lib/platform/actions/WorkspaceActionCatalog";
import { RestaurantRuntime } from "@/lib/restaurant/RestaurantRuntime";

const DOMAIN_RUNTIMES = {
  restaurant: RestaurantRuntime,
};

function normalizeContext(context = {}) {
  return {
    ...context,
    organization_id:
      context.organization_id ||
      context.organizationId ||
      context.organization?.id ||
      null,
    entity_id:
      context.entity_id ||
      context.entityId ||
      context.entity?.id ||
      null,
    period_id:
      context.period_id ||
      context.periodId ||
      context.period?.id ||
      null,
  };
}

function parseCapability(capability) {
  const parts = String(capability || "").split(".");
  return {
    domain: parts[0] || null,
    area: parts[1] || null,
    name: parts[2] || null,
  };
}

async function loadDomainCapability(capability) {
  const parsed = parseCapability(capability);
  const runtime = DOMAIN_RUNTIMES[parsed.domain];

  if (!runtime) {
    throw new Error(`domain_runtime_not_found:${parsed.domain}`);
  }

  const group =
    runtime.capabilities?.[parsed.area] ||
    runtime.workflows?.[parsed.area] ||
    null;

  if (!group) {
    throw new Error(`capability_group_not_found:${capability}`);
  }

  const loader = group[parsed.name];

  if (typeof loader !== "function") {
    throw new Error(`capability_not_found:${capability}`);
  }

  const mod = await loader();

  return mod.execute || mod.default || mod;
}

export async function executeWorkspaceAction({
  actionId,
  action,
  capability,
  context = {},
  payload = {},
}) {
  const actionDefinition =
    action ||
    getWorkspaceActionDefinition(actionId) ||
    {};

  const finalCapability =
    capability ||
    actionDefinition.capability ||
    payload.capability;

  if (!finalCapability) {
    throw new Error("capability_required");
  }

  const engineName =
    actionDefinition.engine ||
    payload.engine ||
    actionId;

  const Engine =
    engineName ? getEngine(engineName) : null;

  const normalizedContext =
    normalizeContext(context);

  const executor =
    await loadDomainCapability(finalCapability);

  return executor({
    context: normalizedContext,
    payload,
    action: actionDefinition,
    engine: Engine,
  });
}
