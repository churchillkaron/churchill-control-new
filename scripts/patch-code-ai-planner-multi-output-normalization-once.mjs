import { readFile, writeFile } from "node:fs/promises";

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`PATCH_TARGET_MISSING:${label}`);
  return source.replace(before, after);
}

const parserPath = "lib/code/runtime/CodeAIPlannerDecisionParser.js";
const parserSource = `const SAFE_MULTI_OBJECT_ACTIONS = new Set(["read", "search", "run"]);

function text(value, maximum = 24000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function actionOf(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return text(value.action, 80).toLowerCase();
}

function topLevelJsonObjects(raw) {
  const values = [];
  let cursor = raw.indexOf("{");
  if (cursor < 0) throw new Error("CODE_AI_AUTONOMOUS_PLANNER_JSON_REQUIRED");

  while (cursor < raw.length) {
    if (raw[cursor] !== "{") {
      const next = raw.indexOf("{", cursor);
      if (next < 0) break;
      const gap = raw.slice(cursor, next).trim();
      if (values.length && gap) {
        throw new Error("CODE_AI_AUTONOMOUS_PLANNER_JSON_INVALID");
      }
      cursor = next;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let index = cursor; index < raw.length; index += 1) {
      const char = raw[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          end = index;
          break;
        }
      }
    }
    if (end < cursor) throw new Error("CODE_AI_AUTONOMOUS_PLANNER_JSON_INVALID");

    let parsed;
    try {
      parsed = JSON.parse(raw.slice(cursor, end + 1));
    } catch {
      throw new Error("CODE_AI_AUTONOMOUS_PLANNER_JSON_INVALID");
    }
    values.push(parsed);

    const next = raw.indexOf("{", end + 1);
    if (next < 0) break;
    const gap = raw.slice(end + 1, next).trim();
    if (gap) throw new Error("CODE_AI_AUTONOMOUS_PLANNER_JSON_INVALID");
    cursor = next;
  }

  return values;
}

export function parseCodeAIPlannerOutput(value, { maxChars = 24000 } = {}) {
  const raw = text(value, maxChars)
    .replace(/^\\`\\`\\`(?:json)?\\s*/i, "")
    .replace(/\\s*\\`\\`\\`$/i, "")
    .trim();
  if (!raw) throw new Error("CODE_AI_AUTONOMOUS_PLANNER_OUTPUT_REQUIRED");

  try {
    return {
      parsed: JSON.parse(raw),
      normalization: {
        mode: "single_json_value",
        object_count: 1,
        discarded_count: 0,
        action: null,
      },
    };
  } catch {}

  const objects = topLevelJsonObjects(raw);
  if (!objects.length) throw new Error("CODE_AI_AUTONOMOUS_PLANNER_JSON_REQUIRED");
  if (objects.length === 1) {
    return {
      parsed: objects[0],
      normalization: {
        mode: "single_extracted_json_object",
        object_count: 1,
        discarded_count: 0,
        action: actionOf(objects[0]) || null,
      },
    };
  }

  const actions = objects.map(actionOf);
  const uniqueActions = [...new Set(actions.filter(Boolean))];
  if (uniqueActions.length !== 1 || actions.some((action) => !action)) {
    throw new Error(
      `CODE_AI_AUTONOMOUS_PLANNER_MULTI_ACTION_CONFLICT:${actions.map((action) => action || "missing").join(",")}`,
    );
  }

  const action = uniqueActions[0];
  if (!SAFE_MULTI_OBJECT_ACTIONS.has(action)) {
    throw new Error(
      `CODE_AI_AUTONOMOUS_PLANNER_MULTI_ACTION_UNSAFE:${action}:${objects.length}`,
    );
  }

  return {
    parsed: objects[0],
    normalization: {
      mode: "same_guarded_action_over_emission",
      object_count: objects.length,
      discarded_count: objects.length - 1,
      action,
    },
  };
}
`;
await writeFile(parserPath, parserSource, "utf8");

const runtimePath = "lib/code/runtime/CodeAIAutonomousRuntime.js";
let runtime = await readFile(runtimePath, "utf8");
runtime = replaceRequired(
  runtime,
  `import { buildCodeAIPlannerPromptTransport } from "./CodeAIPlannerPromptRuntime.js";`,
  `import { buildCodeAIPlannerPromptTransport } from "./CodeAIPlannerPromptRuntime.js";\nimport { parseCodeAIPlannerOutput } from "./CodeAIPlannerDecisionParser.js";`,
  "runtime-parser-import",
);
const parseStart = runtime.indexOf("function parsePlannerDecision(value) {");
const parseEnd = runtime.indexOf("\nfunction compactState(state = {})", parseStart);
if (parseStart < 0 || parseEnd <= parseStart) throw new Error("PATCH_TARGET_MISSING:runtime-parse-planner-decision");
const newParse = `function parsePlannerDecision(value) {
  const { parsed, normalization } = parseCodeAIPlannerOutput(value, {
    maxChars: MAX_PLANNER_OUTPUT,
  });
  const decision = object(parsed);
  const action = text(decision.action, 80).toLowerCase();
  if (!ALLOWED_ACTIONS.has(action)) {
    throw new Error(\`CODE_AI_AUTONOMOUS_ACTION_UNSUPPORTED:\${action || "missing"}\`);
  }
  return {
    action,
    description: text(decision.description, 1200),
    input: object(decision.input),
    reason: text(decision.reason, 2000),
    planner_output_normalization: normalization,
  };
}
`;
runtime = `${runtime.slice(0, parseStart)}${newParse}${runtime.slice(parseEnd)}`;
runtime = replaceRequired(
  runtime,
  `      reason: decision.reason,\n    },`,
  `      reason: decision.reason,\n      output_normalization: decision.planner_output_normalization || null,\n    },`,
  "runtime-planner-normalization-evidence",
);
await writeFile(runtimePath, runtime, "utf8");

const promptPath = "lib/code/runtime/CodeAIPlannerPromptRuntime.js";
let prompt = await readFile(promptPath, "utf8");
prompt = replaceRequired(
  prompt,
  `- Choose exactly ONE next action from CURRENT ALLOWED ACTIONS. If an action type is absent there, the controller has temporarily suppressed it to force forward progress after repeated duplicate decisions.`,
  `- Never emit more than one JSON object. If several actions seem useful, choose only the single highest-priority next action; the controller will replan after observing it.\n- Choose exactly ONE next action from CURRENT ALLOWED ACTIONS. If an action type is absent there, the controller has temporarily suppressed it to force forward progress after repeated duplicate decisions.`,
  "prompt-single-object-rule",
);
await writeFile(promptPath, prompt, "utf8");

const auditPath = "scripts/code-ai-autonomy-loop-guard-audit.mjs";
let audit = await readFile(auditPath, "utf8");
audit = replaceRequired(
  audit,
  `import { readFile } from "node:fs/promises";`,
  `import assert from "node:assert/strict";\nimport { readFile } from "node:fs/promises";\nimport { parseCodeAIPlannerOutput } from "../lib/code/runtime/CodeAIPlannerDecisionParser.js";`,
  "audit-parser-import",
);
audit = replaceRequired(
  audit,
  `const promptSource = await readFile(promptPath, "utf8");`,
  `const promptSource = await readFile(promptPath, "utf8");\n\nconst singlePlannerObject = parseCodeAIPlannerOutput('{"action":"read","description":"one","input":{"file_path":"a.js"}}');\nassert.equal(singlePlannerObject.parsed.action, "read");\nassert.equal(singlePlannerObject.normalization.discarded_count, 0);\n\nconst liveOverEmission = parseCodeAIPlannerOutput(\n  '{"action":"read","description":"first","input":{"file_path":"normalize-money.mjs"}}\\n' +\n  '{"action":"read","description":"second","input":{"file_path":"invoice-summary.mjs"}}',\n);\nassert.equal(liveOverEmission.parsed.input.file_path, "normalize-money.mjs");\nassert.equal(liveOverEmission.normalization.mode, "same_guarded_action_over_emission");\nassert.equal(liveOverEmission.normalization.object_count, 2);\nassert.equal(liveOverEmission.normalization.discarded_count, 1);\nassert.equal(liveOverEmission.normalization.action, "read");\n\nassert.throws(\n  () => parseCodeAIPlannerOutput(\n    '{"action":"read","description":"read","input":{"file_path":"a.js"}}\\n' +\n    '{"action":"apply_files","description":"edit","input":{"files":[]}}',\n  ),\n  /CODE_AI_AUTONOMOUS_PLANNER_MULTI_ACTION_CONFLICT:read,apply_files/,\n);\nassert.throws(\n  () => parseCodeAIPlannerOutput(\n    '{"action":"apply_files","description":"edit one","input":{"files":[]}}\\n' +\n    '{"action":"apply_files","description":"edit two","input":{"files":[]}}',\n  ),\n  /CODE_AI_AUTONOMOUS_PLANNER_MULTI_ACTION_UNSAFE:apply_files:2/,\n);`,
  "audit-parser-behavior-cases",
);
audit = replaceRequired(
  audit,
  `  "source_read_evidence_limit",\n];`,
  `  "source_read_evidence_limit",\n  "parseCodeAIPlannerOutput",\n  "planner_output_normalization",\n  "output_normalization: decision.planner_output_normalization || null",\n];`,
  "audit-runtime-parser-markers",
);
audit = replaceRequired(
  audit,
  `  "An action absent from CURRENT ALLOWED ACTIONS is invalid",`,
  `  "An action absent from CURRENT ALLOWED ACTIONS is invalid",\n  "Never emit more than one JSON object",`,
  "audit-prompt-single-object-marker",
);
audit = audit.replace(
  `contract: "AVANTIQO_CODE_AI_AUTONOMY_LOOP_GUARD_AUDIT_V5",`,
  `contract: "AVANTIQO_CODE_AI_AUTONOMY_LOOP_GUARD_AUDIT_V6",`,
);
audit = replaceRequired(
  audit,
  `    duplicate_objective_and_state_removed_from_structured_specification: true,`,
  `    duplicate_objective_and_state_removed_from_structured_specification: true,\n    same_guarded_multi_object_planner_output_normalized_without_new_provider_call: true,\n    mixed_multi_action_planner_output_fails_closed: true,\n    mutating_multi_object_planner_output_fails_closed: true,\n    planner_prompt_forbids_multi_object_output: true,`,
  "audit-parser-verification-output",
);
await writeFile(auditPath, audit, "utf8");

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_AI_PLANNER_MULTI_OUTPUT_NORMALIZATION_PATCH_V1",
  files_changed: [parserPath, runtimePath, promptPath, auditPath],
  live_failure_shape_covered: true,
  same_guarded_multi_object_output_normalized_locally: true,
  mixed_or_mutating_multi_object_output_fails_closed: true,
  provider_calls_executed: false,
  provider_spend_performed: false,
  runpod_lease_opened: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
