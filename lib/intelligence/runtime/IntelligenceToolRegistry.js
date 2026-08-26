const CONTRACT = "AVANTIQO_INTELLIGENCE_TOOL_REGISTRY_V1";
const GOVERNED_OUTCOME_CONTRACT = "AVANTIQO_GOVERNED_TOOL_OUTCOME_V1";
const TOOL_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const DEFAULT_MAX_RESULT_CHARS = 24000;
const MAX_RESULT_CHARS = 100000;
const MAX_GOVERNED_OUTCOMES = 64;
const EPISTEMIC_ROLES = new Set(["research", "live_read", "verification"]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function normalizedParameters(value) {
  const parameters = object(value);
  if (!Object.keys(parameters).length) {
    return {
      type: "object",
      properties: {},
      additionalProperties: false,
    };
  }
  return parameters;
}

function normalizedEpistemicRoles(definition = {}) {
  const metadata = object(definition.metadata);
  const source = Array.isArray(definition.epistemic_roles)
    ? definition.epistemic_roles
    : Array.isArray(definition.epistemicRoles)
      ? definition.epistemicRoles
      : Array.isArray(metadata.epistemic_roles)
        ? metadata.epistemic_roles
        : Array.isArray(metadata.epistemicRoles)
          ? metadata.epistemicRoles
          : [];
  return Object.freeze([
    ...new Set(
      source
        .map((role) => text(role).toLowerCase())
        .filter((role) => EPISTEMIC_ROLES.has(role)),
    ),
  ]);
}

function approvedToolNames(authorization = {}) {
  const source = Array.isArray(authorization.approved_tool_names)
    ? authorization.approved_tool_names
    : Array.isArray(authorization.approvedTools)
      ? authorization.approvedTools
      : [];
  return new Set(source.map(text).filter(Boolean));
}

function toolDefinition(definition = {}) {
  const name = text(definition.name || definition.id);
  if (!TOOL_NAME_PATTERN.test(name)) {
    throw new Error(`AVANTIQO_INTELLIGENCE_TOOL_NAME_INVALID:${name || "missing"}`);
  }
  if (typeof definition.execute !== "function") {
    throw new Error(`AVANTIQO_INTELLIGENCE_TOOL_EXECUTOR_REQUIRED:${name}`);
  }

  const maxResultChars = Math.min(
    MAX_RESULT_CHARS,
    positiveInteger(definition.max_result_chars || definition.maxResultChars, DEFAULT_MAX_RESULT_CHARS),
  );

  return Object.freeze({
    name,
    description: text(definition.description) || `Execute the governed ${name} tool.`,
    parameters: normalizedParameters(definition.parameters),
    execute: definition.execute,
    mutates: definition.mutates === true,
    approval_required: definition.approval_required === true || definition.approvalRequired === true,
    epistemic_roles: normalizedEpistemicRoles(definition),
    max_result_chars: maxResultChars,
    metadata: Object.freeze({ ...object(definition.metadata) }),
  });
}

function publicToolDescriptor(tool) {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

function publicToolSemantics(tool) {
  if (!tool) return null;
  return Object.freeze({
    mutates: tool.mutates === true,
    epistemic_roles: Object.freeze([...tool.epistemic_roles]),
  });
}

function normalizedFailureCode(value) {
  return text(value)
    .slice(0, 160)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function safeStructuredFailureCode(error) {
  return normalizedFailureCode(
    error?.code || error?.cause?.code,
  ) || "AVANTIQO_INTELLIGENCE_TOOL_EXECUTION_FAILED";
}

function governedBindingKey(toolName, args = {}) {
  const source = object(args);
  return text(
    source.capability_key ||
    source.capabilityKey ||
    source.capability ||
    toolName,
  ).slice(0, 300) || null;
}

function governedOutcomeReceipt({
  toolName,
  args = {},
  context = {},
  mutates = null,
  outcome,
  code = null,
} = {}) {
  const sourceContext = object(context);
  return Object.freeze({
    contract: GOVERNED_OUTCOME_CONTRACT,
    tool_call_id: text(sourceContext.tool_call_id).slice(0, 240) || null,
    tool_name: text(toolName).slice(0, 120) || null,
    binding_key: governedBindingKey(toolName, args),
    outcome: text(outcome).toLowerCase().slice(0, 40) || "unknown",
    code: normalizedFailureCode(code) || null,
    mutates: typeof mutates === "boolean" ? mutates : null,
    reasoning_turn: Number.isInteger(Number(sourceContext.reasoning_turn))
      ? Number(sourceContext.reasoning_turn)
      : null,
    raw_result_persisted: false,
    raw_error_persisted: false,
  });
}

export function createIntelligenceToolRegistry(definitions = []) {
  if (!Array.isArray(definitions)) {
    throw new Error("AVANTIQO_INTELLIGENCE_TOOL_DEFINITIONS_ARRAY_REQUIRED");
  }

  const byName = new Map();
  for (const definition of definitions) {
    const tool = toolDefinition(definition);
    if (byName.has(tool.name)) {
      throw new Error(`AVANTIQO_INTELLIGENCE_TOOL_DUPLICATE:${tool.name}`);
    }
    byName.set(tool.name, tool);
  }

  const governedOutcomes = [];

  function recordGovernedOutcome(receipt) {
    governedOutcomes.push(receipt);
    if (governedOutcomes.length > MAX_GOVERNED_OUTCOMES) {
      governedOutcomes.splice(0, governedOutcomes.length - MAX_GOVERNED_OUTCOMES);
    }
  }

  function governedOutcomeSnapshot() {
    return Object.freeze(
      governedOutcomes.map((receipt) => Object.freeze({ ...receipt })),
    );
  }

  async function execute({ name, arguments: args = {}, context = {}, authorization = {} } = {}) {
    const toolName = text(name);
    const safeArgs = object(args);
    const safeContext = object(context);
    const tool = byName.get(toolName);
    if (!tool) {
      const code = "AVANTIQO_INTELLIGENCE_UNKNOWN_TOOL";
      recordGovernedOutcome(governedOutcomeReceipt({
        toolName,
        args: safeArgs,
        context: safeContext,
        mutates: null,
        outcome: "blocked",
        code,
      }));
      return {
        ok: false,
        blocked: true,
        code,
        tool: toolName || null,
      };
    }

    const approved = approvedToolNames(authorization);
    if (tool.mutates && authorization.allow_mutating_tools !== true) {
      const code = "AVANTIQO_INTELLIGENCE_MUTATING_TOOL_AUTHORIZATION_REQUIRED";
      recordGovernedOutcome(governedOutcomeReceipt({
        toolName: tool.name,
        args: safeArgs,
        context: safeContext,
        mutates: true,
        outcome: "blocked",
        code,
      }));
      return {
        ok: false,
        blocked: true,
        code,
        tool: tool.name,
      };
    }
    if (
      tool.approval_required &&
      authorization.approve_all_tools !== true &&
      !approved.has(tool.name)
    ) {
      const code = "AVANTIQO_INTELLIGENCE_TOOL_APPROVAL_REQUIRED";
      recordGovernedOutcome(governedOutcomeReceipt({
        toolName: tool.name,
        args: safeArgs,
        context: safeContext,
        mutates: tool.mutates,
        outcome: "blocked",
        code,
      }));
      return {
        ok: false,
        blocked: true,
        code,
        tool: tool.name,
      };
    }

    const priorGovernedOutcomes = governedOutcomeSnapshot();
    try {
      const result = await tool.execute(safeArgs, {
        ...safeContext,
        tool_name: tool.name,
        governed_tool_outcome_contract: GOVERNED_OUTCOME_CONTRACT,
        governed_tool_outcomes: priorGovernedOutcomes,
      });
      recordGovernedOutcome(governedOutcomeReceipt({
        toolName: tool.name,
        args: safeArgs,
        context: safeContext,
        mutates: tool.mutates,
        outcome: "succeeded",
      }));
      return {
        ok: true,
        blocked: false,
        tool: tool.name,
        result: result ?? null,
        max_result_chars: tool.max_result_chars,
      };
    } catch (error) {
      const code = safeStructuredFailureCode(error);
      recordGovernedOutcome(governedOutcomeReceipt({
        toolName: tool.name,
        args: safeArgs,
        context: safeContext,
        mutates: tool.mutates,
        outcome: "failed",
        code,
      }));
      return {
        ok: false,
        blocked: false,
        code,
        tool: tool.name,
        error: text(error?.message || error) || "tool execution failed",
        max_result_chars: tool.max_result_chars,
      };
    }
  }

  return Object.freeze({
    contract: CONTRACT,
    governedOutcomeContract: GOVERNED_OUTCOME_CONTRACT,
    size: byName.size,
    names: () => [...byName.keys()],
    descriptors: () => [...byName.values()].map(publicToolDescriptor),
    semantics: (name) => publicToolSemantics(byName.get(text(name)) || null),
    resolve: (name) => byName.get(text(name)) || null,
    execute,
  });
}

export const AVANTIQO_INTELLIGENCE_TOOL_REGISTRY_CONTRACT = CONTRACT;
export const AVANTIQO_GOVERNED_TOOL_OUTCOME_CONTRACT = GOVERNED_OUTCOME_CONTRACT;
