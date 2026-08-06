import {
  CANONICAL_OPERATIONS_CAPABILITY_CATALOG,
} from "@/lib/operations/runtime/CanonicalOperationsCapabilityCatalog";

const GROUPS = Object.freeze([
  { id: "commerce-execution", name: "Commerce Execution", description: "Run configurable point-of-sale, order capture, checkout, receipts, cash control and fulfillment dispatch across industries.", order: 5 },
  { id: "execution", name: "Work Execution", description: "Capture, authorise, coordinate and complete operational work.", order: 10 },
  { id: "planning", name: "Planning & Scheduling", description: "Plan workload, work schedules, capacity and operational windows.", order: 20 },
  { id: "orchestration", name: "Dispatch & Orchestration", description: "Prioritise, route, assign, dispatch and coordinate operational demand.", order: 30 },
  { id: "resources", name: "Operational Resources", description: "Manage work centres, equipment, devices, capacity and non-workforce availability.", order: 40 },
  { id: "control", name: "Controlled Execution", description: "Govern procedures, instructions, checklists, approvals, evidence and policies.", order: 50 },
  { id: "resilience", name: "Incidents & Resilience", description: "Manage incidents, exceptions, recovery, continuity and operational risk.", order: 60 },
  { id: "quality", name: "Quality Execution", description: "Plan, inspect, validate, contain and release operational quality outcomes.", order: 70 },
  { id: "performance", name: "Service Performance", description: "Define commitments and analyse throughput, backlog, timing and utilisation.", order: 80 },
  { id: "intelligence", name: "Operational Intelligence", description: "Monitor live execution, alerts, events, forecasts and command interventions.", order: 90 },
]);

const EVENT_STREAM_CAPABILITIES = new Set([
  "work-history",
  "operational-events",
  "operational-timeline",
  "audit-trail",
]);

const COMMERCE_WORKSPACE_OVERRIDES = Object.freeze({
  "point-of-sale": Object.freeze({
    route: "/operations/pos",
    renderer: "CommerceApplicationWorkspace",
    listApi: "/api/pos/runtime",
    rowsKey: null,
    source: "operations_applications",
  }),
  "order-capture": Object.freeze({
    route: "/operations/pos?view=sell",
    renderer: "CommerceApplicationWorkspace",
    listApi: "/api/pos/orders",
    rowsKey: "orders",
    source: "commerce_orders",
  }),
  checkout: Object.freeze({
    route: "/operations/pos?view=checkout",
    renderer: "CommerceApplicationWorkspace",
    listApi: "/api/pos/payable-contexts",
    rowsKey: "contexts",
    source: "commerce_checkout",
  }),
  receipts: Object.freeze({
    route: "/operations/pos?view=receipts",
    renderer: "CommerceApplicationWorkspace",
    listApi: "/api/pos/receipts",
    rowsKey: "receipts",
    source: "commerce_receipts",
  }),
  "cash-control": Object.freeze({
    route: "/operations/pos?view=cash-control",
    renderer: "CommerceApplicationWorkspace",
    listApi: "/api/pos/cash-sessions",
    rowsKey: "sessions",
    source: "commerce_cash_sessions",
  }),
  "fulfillment-dispatch": Object.freeze({
    route: "/operations/fulfillment-dispatch",
    renderer: "FulfillmentDispatchWorkspace",
    listApi: "/api/operations/fulfillment",
    rowsKey: "entries",
    source: "operations_fulfillment",
  }),
});

const CREATE_COMMANDS = new Set([
  "create",
  "record",
  "report",
  "raise",
  "set",
  "prepare",
  "issue",
  "open",
  "dispatch",
]);

const ROW_COMMANDS_TO_EXCLUDE = new Set(CREATE_COMMANDS);

function formatCommandLabel(command) {
  return command
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveCreateCommand(capability) {
  return capability.commands.find((command) => CREATE_COMMANDS.has(command)) || null;
}

function commandEndpoint(capabilityId, command) {
  return `/api/operations/${capabilityId}/commands/${command}`;
}

function buildTopMenu(capability, override = null) {
  if (override) {
    return [
      { id: "open", type: "open", capability: capability.id, label: "Open Workspace" },
      { id: "export", type: "export", capability: capability.id, label: "Export" },
      { id: "ai", type: "ai", capability: capability.id, label: "AI" },
    ];
  }

  const menu = [];
  const createCommand = resolveCreateCommand(capability);

  if (!capability.readOnly && createCommand) {
    menu.push({
      id: createCommand,
      type: "create",
      command: createCommand,
      capability: capability.id,
      endpoint: commandEndpoint(capability.id, createCommand),
      label: formatCommandLabel(createCommand),
    });
  }

  menu.push(
    { id: "export", type: "export", capability: capability.id, label: "Export" },
    { id: "ai", type: "ai", capability: capability.id, label: "AI" },
  );

  if (!capability.readOnly) {
    menu.splice(menu.length - 1, 0, {
      id: "import",
      type: "import",
      capability: capability.id,
      label: "Import",
    });
  }

  return menu;
}

function buildRowMenu(capability, override = null) {
  if (override) return [{ id: "open", type: "open", label: "Open" }];

  const menu = [{ id: "open", type: "open", label: "Open" }];

  if (capability.readOnly) return menu;

  for (const command of capability.commands) {
    if (ROW_COMMANDS_TO_EXCLUDE.has(command)) continue;

    menu.push({
      id: command,
      type: "capability",
      capability: capability.id,
      action: command,
      command,
      endpoint: commandEndpoint(capability.id, command),
      label: formatCommandLabel(command),
    });
  }

  return menu;
}

function toDocumentName(capabilityId) {
  return capabilityId
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function buildWorkspaceItem(capability, order) {
  const document = toDocumentName(capability.id);
  const override = COMMERCE_WORKSPACE_OVERRIDES[capability.id] || null;
  const route = override?.route || `/operations/${capability.id}`;
  const createCommand = resolveCreateCommand(capability);
  const usesEventStream = EVENT_STREAM_CAPABILITIES.has(capability.id);
  const renderer = override?.renderer || (usesEventStream
    ? "OperationsEventWorkCenter"
    : "OperationsRuntimeWorkCenter");
  const listApi = override?.listApi || (usesEventStream
    ? "/api/operations/events"
    : `/api/operations/${capability.id}`);
  const rowsKey = override?.rowsKey ?? (usesEventStream ? "events" : "rows");

  return Object.freeze({
    id: capability.id.replaceAll("-", "_"),
    capabilityId: capability.id,
    name: capability.name,
    route,
    description: capability.description,
    order,
    status: "active",
    type: override
      ? "commerce-application-workspace"
      : capability.recordType === "intelligence"
        ? "operational-intelligence-workspace"
        : "operational-workspace",
    document,
    owner: capability.owner,
    consumes: [...capability.consumes],
    boundary: capability.boundary,
    lifecycle: capability.lifecycle,
    recordType: capability.recordType,
    readOnly: capability.readOnly,
    renderer,
    runtime: {
      domain: "operations",
      capability: capability.id,
      lifecycle: capability.lifecycle,
      recordType: capability.recordType,
      renderer,
      source: override?.source || (usesEventStream ? "operations_events" : "operations_records"),
      listApi,
      detailApi: override || usesEventStream ? null : `/api/operations/${capability.id}/:id`,
      commandApi: override || usesEventStream ? null : `/api/operations/${capability.id}/commands/:command`,
      eventsApi: `/api/operations/events?capability_id=${capability.id}`,
      eventHealthApi: "/api/operations/events/health",
    },
    create: override || capability.readOnly || !createCommand
      ? { enabled: false }
      : {
          enabled: true,
          type: "document",
          engine: "create",
          id: capability.id,
          capability: capability.id,
          action: createCommand,
          command: createCommand,
          api: commandEndpoint(capability.id, createCommand),
          endpoint: commandEndpoint(capability.id, createCommand),
          form: capability.id,
          label: formatCommandLabel(createCommand),
          title: capability.name,
        },
    ui: {
      api: listApi,
      rowsKey,
      nameField: usesEventStream ? "event_type" : "name",
      search: usesEventStream
        ? ["event_type", "capability_id", "command", "aggregate_type", "aggregate_id", "actor_id"]
        : [
            "name",
            "code",
            "description",
            "status",
            "priority",
            "assigned_to",
            "source_domain",
            "source_type",
            "source_id",
          ],
      topMenu: buildTopMenu(capability, override),
      rowMenu: buildRowMenu(capability, override),
    },
    commands: override
      ? []
      : capability.commands.map((command) => ({
          id: command,
          label: formatCommandLabel(command),
          capability: capability.id,
          action: command,
          command,
          endpoint: commandEndpoint(capability.id, command),
        })),
    events: [...capability.events],
  });
}

export function buildOperationsWorkspaceRegistry() {
  return Object.freeze({
    id: "operations",
    title: "Operations",
    description:
      "Industry-neutral commerce and work execution, planning, orchestration, control, resilience, quality, performance and operational intelligence.",
    groups: GROUPS.map((group) => Object.freeze({
      ...group,
      items: CANONICAL_OPERATIONS_CAPABILITY_CATALOG
        .filter((capability) => capability.group === group.id)
        .map((capability, index) => buildWorkspaceItem(capability, (index + 1) * 10)),
    })),
  });
}

export const OPERATIONS_WORKSPACE_REGISTRY = buildOperationsWorkspaceRegistry();

export default OPERATIONS_WORKSPACE_REGISTRY;
