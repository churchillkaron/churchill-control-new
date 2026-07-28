import {
  OPERATIONS_CAPABILITY_CATALOG,
} from "@/lib/operations/runtime/OperationsCapabilityCatalog";

const GROUPS = Object.freeze([
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

const CREATE_COMMANDS = new Set([
  "create",
  "record",
  "report",
  "raise",
  "set",
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

function buildTopMenu(capability) {
  const menu = [];
  const createCommand = resolveCreateCommand(capability);

  if (!capability.readOnly && createCommand) {
    menu.push({
      id: createCommand,
      type: "create",
      command: createCommand,
      capability: capability.id,
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

function buildRowMenu(capability) {
  const menu = [{ id: "open", type: "open", label: "Open" }];

  if (capability.readOnly) {
    return menu;
  }

  for (const command of capability.commands) {
    if (ROW_COMMANDS_TO_EXCLUDE.has(command)) continue;

    menu.push({
      id: command,
      type: "capability",
      capability: capability.id,
      action: command,
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
  const route = `/operations/${capability.id}`;
  const createCommand = resolveCreateCommand(capability);

  return Object.freeze({
    id: capability.id.replaceAll("-", "_"),
    capabilityId: capability.id,
    name: capability.name,
    route,
    description: capability.description,
    order,
    status: "active",
    type: capability.recordType === "intelligence"
      ? "operational-intelligence-workspace"
      : "operational-workspace",
    document,
    owner: capability.owner,
    consumes: [...capability.consumes],
    boundary: capability.boundary,
    lifecycle: capability.lifecycle,
    recordType: capability.recordType,
    readOnly: capability.readOnly,
    renderer: "ServiceRuntimeWorkCenter",
    runtime: {
      domain: "operations",
      capability: capability.id,
      lifecycle: capability.lifecycle,
      recordType: capability.recordType,
      renderer: "ServiceRuntimeWorkCenter",
      listApi: `/api/operations/${capability.id}`,
      detailApi: `/api/operations/${capability.id}/:id`,
      commandApi: `/api/operations/${capability.id}/commands`,
      eventsApi: `/api/operations/events?capability=${capability.id}`,
    },
    create: capability.readOnly || !createCommand
      ? { enabled: false }
      : {
          enabled: true,
          type: "document",
          engine: "create",
          id: capability.id,
          capability: capability.id,
          action: createCommand,
          form: capability.id,
          label: formatCommandLabel(createCommand),
          title: capability.name,
        },
    ui: {
      api: `/api/operations/${capability.id}`,
      rowsKey: capability.id.replaceAll("-", "_"),
      search: ["name", "reference", "status", "owner", "priority"],
      topMenu: buildTopMenu(capability),
      rowMenu: buildRowMenu(capability),
    },
    commands: capability.commands.map((command) => ({
      id: command,
      label: formatCommandLabel(command),
      capability: capability.id,
      action: command,
    })),
    events: [...capability.events],
  });
}

export function buildOperationsWorkspaceRegistry() {
  return Object.freeze({
    title: "Operations",
    description:
      "Industry-neutral work execution, planning, orchestration, control, resilience, quality, performance and operational intelligence.",
    groups: GROUPS.map((group) => Object.freeze({
      ...group,
      items: OPERATIONS_CAPABILITY_CATALOG
        .filter((capability) => capability.group === group.id)
        .map((capability, index) => buildWorkspaceItem(capability, (index + 1) * 10)),
    })),
  });
}

export const OPERATIONS_WORKSPACE_REGISTRY = buildOperationsWorkspaceRegistry();

export default OPERATIONS_WORKSPACE_REGISTRY;
