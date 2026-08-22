const CONTRACT = "AVANTIQO_INTELLIGENCE_TOOL_REGISTRY_V1";
const TOOL_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const DEFAULT_MAX_RESULT_CHARS = 24000;
const MAX_RESULT_CHARS = 100000;

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

  async function execute({ name, arguments: args = {}, context = {}, authorization = {} } = {}) {
    const toolName = text(name);
    const tool = byName.get(toolName);
    if (!tool) {
      return {
        ok: false,
        blocked: true,
        code: "AVANTIQO_INTELLIGENCE_UNKNOWN_TOOL",
        tool: toolName || null,
      };
    }

    const approved = approvedToolNames(authorization);
    if (tool.mutates && authorization.allow_mutating_tools !== true) {
      return {
        ok: false,
        blocked: true,
        code: "AVANTIQO_INTELLIGENCE_MUTATING_TOOL_AUTHORIZATION_REQUIRED",
        tool: tool.name,
      };
    }
    if (
      tool.approval_required &&
      authorization.approve_all_tools !== true &&
      !approved.has(tool.name)
    ) {
      return {
        ok: false,
        blocked: true,
        code: "AVANTIQO_INTELLIGENCE_TOOL_APPROVAL_REQUIRED",
        tool: tool.name,
      };
    }

    try {
      const result = await tool.execute(object(args), {
        ...object(context),
        tool_name: tool.name,
      });
      return {
        ok: true,
        blocked: false,
        tool: tool.name,
        result: result ?? null,
        max_result_chars: tool.max_result_chars,
      };
    } catch (error) {
      return {
        ok: false,
        blocked: false,
        code: "AVANTIQO_INTELLIGENCE_TOOL_EXECUTION_FAILED",
        tool: tool.name,
        error: text(error?.message || error) || "tool execution failed",
        max_result_chars: tool.max_result_chars,
      };
    }
  }

  return Object.freeze({
    contract: CONTRACT,
    size: byName.size,
    names: () => [...byName.keys()],
    descriptors: () => [...byName.values()].map(publicToolDescriptor),
    resolve: (name) => byName.get(text(name)) || null,
    execute,
  });
}

export const AVANTIQO_INTELLIGENCE_TOOL_REGISTRY_CONTRACT = CONTRACT;
