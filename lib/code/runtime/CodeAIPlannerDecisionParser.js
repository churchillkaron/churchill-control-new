const SAFE_MULTI_OBJECT_ACTIONS = new Set(["read", "search", "run"]);

function text(value, maximum = 24000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function actionOf(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return text(value.action, 80).toLowerCase();
}

function stripMarkdownFence(value, maximum) {
  let raw = text(value, maximum);
  const fence = String.fromCharCode(96).repeat(3);
  if (raw.startsWith(fence)) {
    raw = raw.slice(fence.length).replace(/^json\s*/i, "");
  }
  if (raw.endsWith(fence)) {
    raw = raw.slice(0, -fence.length).trim();
  }
  return raw;
}

function safeSingleTrailingBraceOverEmission(raw) {
  if (!raw.endsWith("}")) return null;
  const candidate = raw.slice(0, -1).trimEnd();
  if (!candidate.endsWith("}")) return null;

  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }

  const action = actionOf(parsed);
  if (!SAFE_MULTI_OBJECT_ACTIONS.has(action)) return null;

  return {
    parsed,
    normalization: {
      mode: "single_guarded_trailing_brace_over_emission",
      object_count: 1,
      discarded_count: 0,
      discarded_trailing_brace_count: 1,
      action,
    },
  };
}

function topLevelJsonObjects(raw) {
  const values = [];
  let cursor = raw.indexOf("{");
  if (cursor < 0) throw new Error("CODE_AI_AUTONOMOUS_PLANNER_JSON_REQUIRED");

  const prefix = raw.slice(0, cursor).trim();
  if (prefix) throw new Error("CODE_AI_AUTONOMOUS_PLANNER_JSON_INVALID");

  while (cursor < raw.length) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;

    for (let index = cursor; index < raw.length; index += 1) {
      const char = raw[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
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
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          end = index;
          break;
        }
        if (depth < 0) {
          throw new Error("CODE_AI_AUTONOMOUS_PLANNER_JSON_INVALID");
        }
      }
    }

    if (end < cursor || depth !== 0 || inString) {
      throw new Error("CODE_AI_AUTONOMOUS_PLANNER_JSON_INVALID");
    }

    let parsed;
    try {
      parsed = JSON.parse(raw.slice(cursor, end + 1));
    } catch {
      throw new Error("CODE_AI_AUTONOMOUS_PLANNER_JSON_INVALID");
    }
    values.push(parsed);

    let next = end + 1;
    while (next < raw.length && /\s/.test(raw[next])) next += 1;
    if (next >= raw.length) break;
    if (raw[next] !== "{") {
      throw new Error("CODE_AI_AUTONOMOUS_PLANNER_JSON_INVALID");
    }
    cursor = next;
  }

  return values;
}

export function parseCodeAIPlannerOutput(value, { maxChars = 24000 } = {}) {
  const raw = stripMarkdownFence(value, maxChars);
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

  const trailingBraceRecovery = safeSingleTrailingBraceOverEmission(raw);
  if (trailingBraceRecovery) return trailingBraceRecovery;

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
      `CODE_AI_AUTONOMOUS_PLANNER_MULTI_ACTION_CONFLICT:${actions
        .map((action) => action || "missing")
        .join(",")}`,
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
