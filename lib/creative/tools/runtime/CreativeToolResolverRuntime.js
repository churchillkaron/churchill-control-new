import {
  CreativeToolRegistry,
  CREATIVE_TOOL_RUNTIME,
} from "@/lib/creative/tools/registry/CreativeToolRegistry";

const CONTRACT = "CREATIVE_TOOL_RESOLVER_RUNTIME_V1";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function snapshotState(project = {}) {
  return object(project?.metadata?.creative_tool_snapshots);
}

function sandboxReady(tool, project = {}) {
  const snapshot = object(snapshotState(project)[tool.id]);
  return snapshot.ready === true && text(snapshot.snapshot_id).length > 0;
}

function readiness(tool, project = {}) {
  if (tool.runtime === CREATIVE_TOOL_RUNTIME.LOCAL) {
    return tool.available === false ? "UNAVAILABLE" : "READY";
  }

  if (tool.runtime === CREATIVE_TOOL_RUNTIME.SANDBOX) {
    return sandboxReady(tool, project) ? "READY" : "BOOTSTRAP_REQUIRED";
  }

  if (tool.runtime === CREATIVE_TOOL_RUNTIME.SERVICE_RUNTIME) {
    return "SERVICE_GOVERNANCE_REQUIRED";
  }

  return "UNAVAILABLE";
}

function executionContract(tool, project = {}) {
  const state = readiness(tool, project);

  if (tool.runtime === CREATIVE_TOOL_RUNTIME.LOCAL) {
    return {
      runtime: tool.runtime,
      tool_id: tool.id,
      status: state,
      execution: "LOCAL_RUNTIME",
      source: tool.source || null,
    };
  }

  if (tool.runtime === CREATIVE_TOOL_RUNTIME.SANDBOX) {
    const snapshot = object(snapshotState(project)[tool.id]);
    return {
      runtime: tool.runtime,
      tool_id: tool.id,
      status: state,
      execution: "SANDBOX_SNAPSHOT",
      snapshot_id: snapshot.snapshot_id || null,
    };
  }

  return {
    runtime: tool.runtime,
    tool_id: tool.id,
    status: state,
    execution: "SERVICE_RUNTIME",
    provider_selection: "GOVERNED_AT_EXECUTION",
  };
}

export function resolveCreativeCapability({
  capability,
  project = {},
  preferred_runtime = null,
  require_ready = false,
} = {}) {
  const requestedCapability = text(capability);
  if (!requestedCapability) {
    throw new Error("CREATIVE_TOOL_CAPABILITY_REQUIRED");
  }

  const candidates = CreativeToolRegistry
    .forCapability(requestedCapability)
    .filter((tool) => !preferred_runtime || tool.runtime === preferred_runtime)
    .map((tool) => ({
      ...tool,
      resolution: executionContract(tool, project),
    }));

  if (!candidates.length) {
    throw new Error(`CREATIVE_TOOL_CAPABILITY_UNREGISTERED:${requestedCapability}`);
  }

  const ready = candidates.find((candidate) =>
    ["READY", "SERVICE_GOVERNANCE_REQUIRED"].includes(candidate.resolution.status),
  );

  const selected = ready || candidates[0];

  if (require_ready && selected.resolution.status !== "READY") {
    const error = new Error(
      `CREATIVE_TOOL_CAPABILITY_NOT_READY:${requestedCapability}:${selected.resolution.status}`,
    );
    error.details = {
      capability: requestedCapability,
      candidates: candidates.map((candidate) => ({
        tool_id: candidate.id,
        runtime: candidate.runtime,
        status: candidate.resolution.status,
      })),
    };
    throw error;
  }

  return {
    contract: CONTRACT,
    capability: requestedCapability,
    selected: {
      tool_id: selected.id,
      label: selected.label,
      ...selected.resolution,
    },
    candidates: candidates.map((candidate) => ({
      tool_id: candidate.id,
      label: candidate.label,
      runtime: candidate.runtime,
      status: candidate.resolution.status,
    })),
  };
}

export function resolveCreativeCapabilities({
  capabilities = [],
  project = {},
  preferred_runtime = null,
  require_ready = false,
} = {}) {
  return capabilities.map((capability) =>
    resolveCreativeCapability({
      capability,
      project,
      preferred_runtime,
      require_ready,
    }),
  );
}

export const CreativeToolResolverRuntime = Object.freeze({
  contract: CONTRACT,
  resolve: resolveCreativeCapability,
  resolveMany: resolveCreativeCapabilities,
});
