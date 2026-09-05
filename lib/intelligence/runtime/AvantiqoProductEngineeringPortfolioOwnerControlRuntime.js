import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_PRODUCT_ENGINEERING_PORTFOLIO_OWNER_CONTROL_CONTRACT =
  "AVANTIQO_PRODUCT_ENGINEERING_PORTFOLIO_OWNER_CONTROL_V1";

const MEMORY_TABLE = "intelligence_memories";
const MEMORY_SCOPE = "product_engineering_portfolio_owner_control";
const MEMORY_SOURCE = "product_engineering_portfolio_owner_control_runtime";
const MAX_DIRECTIVES = 16;
const MAX_HISTORY = 40;
const LOCKED_NODE_STATES = new Set([
  "RUNNING_LOCAL_ENGINEERING",
  "WAITING_GOVERNED_PERSISTENCE",
  "WAITING_VERIFIED_PERSISTENCE",
  "STALE_BASE_REPLAN_REQUIRED",
  "PAUSED_LOCAL_ONLY",
]);
const NODE_ACTIONS = new Set(["PROMOTE", "DEFER", "REMOVE", "RESTORE"]);
const PORTFOLIO_ACTIONS = new Set(["PAUSE", "RESUME"]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function organizationId(context = {}) {
  return text(context.organizationId || context.organization_id, 160) || null;
}

function actorId(context = {}) {
  return text(context?.actor?.id || context?.actor?.user_id, 160) || null;
}

function normalizedObjective(value) {
  return text(value, 5000)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0e00-\u0e7f\s/_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function objectiveFingerprint(value) {
  return crypto
    .createHash("sha256")
    .update(normalizedObjective(value), "utf8")
    .digest("hex")
    .slice(0, 32);
}

function memoryKey(actor, portfolioId) {
  return `product_engineering_portfolio_owner_control:v1:${crypto
    .createHash("sha256")
    .update(`${actor}:${portfolioId}`, "utf8")
    .digest("hex")
    .slice(0, 40)}`;
}

function decisionId({ actor, portfolioId, revision, action, nodeId, timestamp }) {
  return `portfolio-control:${crypto
    .createHash("sha256")
    .update(
      `${actor}:${portfolioId}:${revision}:${action}:${nodeId || "portfolio"}:${timestamp}`,
      "utf8",
    )
    .digest("hex")
    .slice(0, 32)}`;
}

function normalizeAction(value) {
  const action = text(value, 80).toUpperCase().replace(/[\s-]+/g, "_");
  if (["PAUSE", "PAUSE_PORTFOLIO", "STOP_AFTER_CURRENT"].includes(action)) {
    return "PAUSE";
  }
  if (["RESUME", "RESUME_PORTFOLIO", "CONTINUE_PORTFOLIO"].includes(action)) {
    return "RESUME";
  }
  if (["PROMOTE", "PRIORITIZE", "MAKE_NEXT", "MOVE_NEXT"].includes(action)) {
    return "PROMOTE";
  }
  if (["DEFER", "LOWER_PRIORITY", "MOVE_LATER"].includes(action)) {
    return "DEFER";
  }
  if (["REMOVE", "DROP", "SKIP"].includes(action)) {
    return "REMOVE";
  }
  if (["RESTORE", "UNDO", "CLEAR_DIRECTIVE"].includes(action)) {
    return "RESTORE";
  }
  return null;
}

function tokens(value) {
  return [...new Set(normalizedObjective(value).split(/\s+/).filter((item) => item.length > 2))]
    .slice(0, 40);
}

function targetScore(node, query) {
  const needle = normalizedObjective(query);
  const objective = normalizedObjective(node?.objective);
  if (!needle || !objective) return 0;
  if (objective === needle) return 1000;
  if (objective.includes(needle) || needle.includes(objective)) return 700;
  const queryTokens = tokens(needle);
  const objectiveTokens = new Set(tokens(objective));
  const overlap = queryTokens.filter((token) => objectiveTokens.has(token)).length;
  return overlap ? overlap * 20 + Math.round((overlap / queryTokens.length) * 100) : 0;
}

function resolveTargetNode(portfolio = {}, { nodeId = null, objectiveQuery = null } = {}) {
  const roadmap = list(portfolio.roadmap);
  const requestedNodeId = text(nodeId, 200);
  if (requestedNodeId) {
    const exact = roadmap.find((node) => text(node?.node_id, 200) === requestedNodeId);
    if (!exact) throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_CONTROL_NODE_NOT_FOUND");
    return exact;
  }

  const query = text(objectiveQuery, 1800);
  if (!query) throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_CONTROL_TARGET_REQUIRED");
  const ranked = roadmap
    .map((node) => ({ node, score: targetScore(node, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || Number(a.node?.rank || 999) - Number(b.node?.rank || 999));
  if (!ranked.length) throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_CONTROL_NODE_NOT_FOUND");
  if (ranked.length > 1 && ranked[0].score === ranked[1].score) {
    throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_CONTROL_TARGET_AMBIGUOUS");
  }
  return ranked[0].node;
}

function lockedCurrentNode(portfolio = {}) {
  const currentId = text(portfolio.current_node_id, 200);
  const current = list(portfolio.roadmap).find(
    (node) => text(node?.node_id, 200) === currentId,
  );
  if (!current) return null;
  return Boolean(
    text(portfolio.current_execution_key, 200) ||
    LOCKED_NODE_STATES.has(text(current.status, 120)),
  )
    ? current
    : null;
}

function baseControl({ context, portfolioId }) {
  const orgId = organizationId(context);
  const actor = actorId(context);
  if (!orgId) throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_CONTROL_ORGANIZATION_REQUIRED");
  if (!actor) throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_CONTROL_ACTOR_REQUIRED");
  if (!text(portfolioId, 200)) {
    throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_CONTROL_PORTFOLIO_ID_REQUIRED");
  }
  return {
    contract: AVANTIQO_PRODUCT_ENGINEERING_PORTFOLIO_OWNER_CONTROL_CONTRACT,
    portfolio_id: text(portfolioId, 200),
    organization_id: orgId,
    actor_id: actor,
    paused: false,
    pause_mode: null,
    control_revision: 0,
    directives: [],
    decision_history: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    authorization_effect: "NONE",
  };
}

function safeDirective(value = {}) {
  const action = normalizeAction(value.action);
  if (!NODE_ACTIONS.has(action)) return null;
  const objective = text(value.objective, 1800);
  if (!objective) return null;
  return {
    directive_id: text(value.directive_id, 200) || null,
    action,
    node_id_at_decision: text(value.node_id_at_decision, 200) || null,
    objective,
    objective_fingerprint:
      text(value.objective_fingerprint, 80) || objectiveFingerprint(objective),
    reason: text(value.reason, 800) || null,
    created_at: text(value.created_at, 120) || null,
    actor_id: text(value.actor_id, 160) || null,
    source: text(value.source, 120) || null,
    active: value.active !== false,
  };
}

function safeDecision(value = {}) {
  const action = normalizeAction(value.action);
  if (!action) return null;
  return {
    decision_id: text(value.decision_id, 200) || null,
    action,
    node_id: text(value.node_id, 200) || null,
    objective: text(value.objective, 1800) || null,
    objective_fingerprint: text(value.objective_fingerprint, 80) || null,
    reason: text(value.reason, 800) || null,
    source: text(value.source, 120) || null,
    control_revision: Number(value.control_revision || 0),
    occurred_at: text(value.occurred_at, 120) || null,
    active_objective_was_immutable: value.active_objective_was_immutable === true,
  };
}

function sanitizeControl(value = {}, { context = {}, portfolioId } = {}) {
  const base = baseControl({ context, portfolioId });
  const source = object(value);
  if (!source.contract) return base;
  if (
    text(source.organization_id, 160) !== base.organization_id ||
    text(source.actor_id, 160) !== base.actor_id ||
    text(source.portfolio_id, 200) !== base.portfolio_id
  ) {
    throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_CONTROL_SCOPE_MISMATCH");
  }
  return {
    ...base,
    paused: source.paused === true,
    pause_mode: text(source.pause_mode, 120) || null,
    control_revision: Math.max(0, Number(source.control_revision || 0)),
    directives: list(source.directives).map(safeDirective).filter(Boolean).slice(-MAX_DIRECTIVES),
    decision_history: list(source.decision_history)
      .map(safeDecision)
      .filter(Boolean)
      .slice(-MAX_HISTORY),
    created_at: text(source.created_at, 120) || base.created_at,
    updated_at: text(source.updated_at, 120) || base.updated_at,
  };
}

function activeDirectiveMap(control = {}) {
  const map = new Map();
  for (const directive of list(control.directives)) {
    if (directive?.active === false) continue;
    const fingerprint = text(directive?.objective_fingerprint, 80);
    if (fingerprint) map.set(fingerprint, directive);
  }
  return map;
}

function dependencyBlocked(node, roadmap) {
  const roadmapIds = new Set(
    list(roadmap)
      .filter((entry) => !["REMOVED_BY_OWNER", "PERSISTED_VERIFIED"].includes(text(entry?.status, 120)))
      .map((entry) => text(entry?.node_id, 200))
      .filter(Boolean),
  );
  return list(node?.dependencies).some((dependency) => roadmapIds.has(text(dependency, 200)));
}

export function governProductEngineeringPortfolioWithOwnerControl(
  portfolioValue = {},
  controlValue = null,
) {
  const portfolio = structuredClone(object(portfolioValue));
  const control = controlValue ? structuredClone(object(controlValue)) : null;
  if (!control?.contract) {
    portfolio.owner_control = null;
    portfolio.owner_execution_allowed = true;
    return portfolio;
  }

  const locked = lockedCurrentNode(portfolio);
  const lockedId = text(locked?.node_id, 200);
  const directives = activeDirectiveMap(control);
  const roadmap = list(portfolio.roadmap).map((sourceNode) => {
    const node = { ...sourceNode };
    const fingerprint = objectiveFingerprint(node.objective);
    const directive = directives.get(fingerprint) || null;
    node.owner_objective_fingerprint = fingerprint;
    node.owner_directive = directive?.action || null;
    node.owner_directive_reason = directive?.reason || null;
    node.owner_directive_matched_current_assessment = Boolean(directive);
    node.owner_priority_promoted = directive?.action === "PROMOTE";
    node.owner_priority_deferred = directive?.action === "DEFER";
    node.owner_removed = directive?.action === "REMOVE";
    node.owner_priority_blocked_by_dependency = false;

    const immutable = lockedId && text(node.node_id, 200) === lockedId;
    if (!immutable && directive?.action === "REMOVE") {
      node.status = "REMOVED_BY_OWNER";
    } else if (!immutable && directive?.action === "DEFER") {
      node.status = "DEFERRED_BY_OWNER";
    }
    return node;
  });

  let selectedId = text(portfolio.current_node_id, 200) || null;
  if (!locked) {
    const promoted = roadmap.find(
      (node) =>
        node.owner_priority_promoted === true &&
        node.owner_removed !== true &&
        node.owner_priority_deferred !== true,
    );
    if (promoted && dependencyBlocked(promoted, roadmap)) {
      promoted.owner_priority_blocked_by_dependency = true;
    }
    const eligiblePromoted = promoted?.owner_priority_blocked_by_dependency === false
      ? promoted
      : null;
    const fallback = roadmap.find(
      (node) =>
        !node.owner_removed &&
        !node.owner_priority_deferred &&
        !["REMOVED_BY_OWNER", "DEFERRED_BY_OWNER", "PERSISTED_VERIFIED"].includes(
          text(node.status, 120),
        ),
    );
    const selected = eligiblePromoted || fallback || null;
    selectedId = text(selected?.node_id, 200) || null;
    for (const node of roadmap) {
      if (text(node.node_id, 200) !== selectedId) continue;
      if (["QUEUED_REASSESSMENT", "REMOVED_BY_OWNER", "DEFERRED_BY_OWNER"].includes(text(node.status, 120))) {
        node.status = "READY";
      }
    }
  }

  portfolio.roadmap = roadmap;
  portfolio.current_node_id = selectedId;
  portfolio.owner_control = compactProductEngineeringPortfolioOwnerControl(control, portfolio);
  portfolio.owner_execution_allowed = control.paused !== true;
  if (control.paused === true) {
    portfolio.owner_control.pause_effective_after_current_safe_boundary = Boolean(locked);
    if (!locked) portfolio.status = "PAUSED_BY_OWNER";
  } else if (!selectedId && !locked && portfolio?.anti_loop?.triggered !== true) {
    portfolio.status = "OWNER_QUEUE_EXHAUSTED";
  }
  return portfolio;
}

export function ownerControlAllowsNewEngineeringCycle(portfolio = {}) {
  if (portfolio?.owner_control?.paused === true) return false;
  if (portfolio?.owner_execution_allowed === false) return false;
  if (portfolio?.anti_loop?.triggered === true) return false;
  const currentId = text(portfolio?.current_node_id, 200);
  const current = list(portfolio?.roadmap).find(
    (node) => text(node?.node_id, 200) === currentId,
  );
  if (!current) return false;
  return !["REMOVED_BY_OWNER", "DEFERRED_BY_OWNER"].includes(text(current.status, 120));
}

export function compactProductEngineeringPortfolioOwnerControl(
  controlValue = {},
  portfolioValue = null,
) {
  const control = object(controlValue);
  if (!control.contract) return null;
  const portfolio = object(portfolioValue);
  const roadmap = list(portfolio.roadmap);
  const matchedFingerprints = new Set(
    roadmap.map((node) => objectiveFingerprint(node?.objective)).filter(Boolean),
  );
  const directives = list(control.directives)
    .map(safeDirective)
    .filter(Boolean)
    .map((directive) => ({
      action: directive.action,
      node_id_at_decision: directive.node_id_at_decision,
      objective: directive.objective,
      objective_fingerprint: directive.objective_fingerprint,
      reason: directive.reason,
      created_at: directive.created_at,
      active: directive.active !== false,
      matched_current_assessment: matchedFingerprints.has(directive.objective_fingerprint),
    }));
  return {
    contract: AVANTIQO_PRODUCT_ENGINEERING_PORTFOLIO_OWNER_CONTROL_CONTRACT,
    portfolio_id: text(control.portfolio_id, 200) || null,
    paused: control.paused === true,
    pause_mode: text(control.pause_mode, 120) || null,
    control_revision: Number(control.control_revision || 0),
    directives,
    decision_history: list(control.decision_history)
      .map(safeDecision)
      .filter(Boolean)
      .slice(-12),
    unmatched_directive_count: directives.filter(
      (directive) => directive.active && directive.matched_current_assessment === false,
    ).length,
    current_objective_immutable_once_claimed: true,
    owner_controls_future_execution_order_only: true,
    raw_source_persisted: false,
    raw_patch_persisted: false,
    raw_reasoning_persisted: false,
    automatic_commit_allowed: false,
    production_deployment_allowed: false,
    authorization_effect: "NONE",
    updated_at: text(control.updated_at, 120) || null,
  };
}

export function attachOwnerControlToProductEngineeringPortfolioProjection({
  compactPortfolio,
  governedPortfolio,
  control,
} = {}) {
  if (!compactPortfolio) return compactPortfolio;
  const governed = object(governedPortfolio);
  const roadmapById = new Map(
    list(governed.roadmap).map((node) => [text(node?.node_id, 200), node]),
  );
  return {
    ...compactPortfolio,
    status: text(governed.status, 120) || compactPortfolio.status,
    current_node_id:
      text(governed.current_node_id, 200) || compactPortfolio.current_node_id || null,
    roadmap: list(compactPortfolio.roadmap).map((node) => {
      const governedNode = roadmapById.get(text(node?.node_id, 200));
      if (!governedNode) return node;
      return {
        ...node,
        status: text(governedNode.status, 120) || node.status,
        owner_directive: text(governedNode.owner_directive, 80) || null,
        owner_directive_reason: text(governedNode.owner_directive_reason, 800) || null,
        owner_priority_promoted: governedNode.owner_priority_promoted === true,
        owner_priority_deferred: governedNode.owner_priority_deferred === true,
        owner_removed: governedNode.owner_removed === true,
        owner_priority_blocked_by_dependency:
          governedNode.owner_priority_blocked_by_dependency === true,
      };
    }),
    owner_control: compactProductEngineeringPortfolioOwnerControl(control, governed),
    owner_execution_allowed: governed.owner_execution_allowed !== false,
  };
}

export async function loadProductEngineeringPortfolioOwnerControl({
  context = {},
  portfolioId,
} = {}) {
  const orgId = organizationId(context);
  const actor = actorId(context);
  const id = text(portfolioId, 200);
  if (!orgId || !actor || !id) {
    return {
      found: false,
      control: id ? baseControl({ context, portfolioId: id }) : null,
      updated_at: null,
    };
  }
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,metadata,updated_at")
    .eq("organization_id", orgId)
    .eq("memory_scope", MEMORY_SCOPE)
    .eq("memory_key", memoryKey(actor, id))
    .eq("active", true)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data?.id) {
    return {
      found: false,
      control: baseControl({ context, portfolioId: id }),
      updated_at: null,
    };
  }
  const metadata = object(result.data.metadata);
  const control = sanitizeControl(metadata.control, { context, portfolioId: id });
  return {
    found: true,
    row_id: result.data.id,
    control,
    updated_at: result.data.updated_at || control.updated_at || null,
  };
}

export async function persistProductEngineeringPortfolioOwnerControl({
  context = {},
  control: controlValue,
} = {}) {
  const control = sanitizeControl(controlValue, {
    context,
    portfolioId: controlValue?.portfolio_id,
  });
  const now = new Date().toISOString();
  control.updated_at = now;
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert({
      organization_id: control.organization_id,
      party_id: null,
      entity_id: null,
      conversation_id: null,
      source_turn_id: null,
      memory_scope: MEMORY_SCOPE,
      memory_key: memoryKey(control.actor_id, control.portfolio_id),
      memory_type: "fact",
      subject: "Product Engineering Portfolio Owner Control",
      content: `Portfolio ${control.portfolio_id} owner control revision ${control.control_revision}.`,
      importance: 0.03,
      confidence: 1,
      source: MEMORY_SOURCE,
      active: true,
      metadata: {
        contract: AVANTIQO_PRODUCT_ENGINEERING_PORTFOLIO_OWNER_CONTROL_CONTRACT,
        actor_id: control.actor_id,
        portfolio_id: control.portfolio_id,
        control,
        ordinary_memory_recall: false,
        reusable_platform_knowledge: false,
        automatic_knowledge_promotion: false,
        raw_source_persisted: false,
        raw_patch_persisted: false,
        raw_reasoning_persisted: false,
        authorization_effect: "NONE",
      },
      updated_at: now,
    }, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id,updated_at")
    .single();
  if (result.error) throw result.error;
  return {
    persisted: Boolean(result.data?.id),
    row_id: result.data?.id || null,
    control,
    updated_at: result.data?.updated_at || now,
  };
}

export async function applyProductEngineeringPortfolioOwnerDecision({
  context = {},
  portfolio: portfolioValue,
  action: requestedAction,
  nodeId = null,
  objectiveQuery = null,
  reason = null,
  source = "BUSINESS_PARTNER",
  expectedControlRevision = null,
} = {}) {
  const portfolio = object(portfolioValue);
  const portfolioId = text(portfolio.portfolio_id, 200);
  const orgId = organizationId(context);
  const actor = actorId(context);
  if (!portfolioId) throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_CONTROL_PORTFOLIO_ID_REQUIRED");
  if (
    text(portfolio.organization_id, 160) !== orgId ||
    text(portfolio.actor_id, 160) !== actor
  ) {
    throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_CONTROL_SCOPE_MISMATCH");
  }
  const action = normalizeAction(requestedAction);
  if (!action || (!NODE_ACTIONS.has(action) && !PORTFOLIO_ACTIONS.has(action))) {
    throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_CONTROL_ACTION_INVALID");
  }

  const loaded = await loadProductEngineeringPortfolioOwnerControl({
    context,
    portfolioId,
  });
  const control = sanitizeControl(loaded.control, { context, portfolioId });
  if (
    expectedControlRevision !== null &&
    expectedControlRevision !== undefined &&
    Number(expectedControlRevision) !== Number(control.control_revision || 0)
  ) {
    throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_CONTROL_REVISION_CONFLICT");
  }

  const locked = lockedCurrentNode(portfolio);
  const target = NODE_ACTIONS.has(action)
    ? resolveTargetNode(portfolio, { nodeId, objectiveQuery })
    : null;
  if (
    target &&
    locked &&
    text(target.node_id, 200) === text(locked.node_id, 200)
  ) {
    throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_CONTROL_ACTIVE_OBJECTIVE_IMMUTABLE");
  }

  const now = new Date().toISOString();
  const nextRevision = Number(control.control_revision || 0) + 1;
  const fingerprint = target ? objectiveFingerprint(target.objective) : null;
  let directives = list(control.directives).map(safeDirective).filter(Boolean);

  if (action === "PAUSE") {
    control.paused = true;
    control.pause_mode = locked
      ? "AFTER_CURRENT_SAFE_BOUNDARY"
      : "BEFORE_NEXT_ENGINEERING_CYCLE";
  } else if (action === "RESUME") {
    control.paused = false;
    control.pause_mode = null;
  } else if (action === "RESTORE") {
    directives = directives.filter(
      (directive) => directive.objective_fingerprint !== fingerprint,
    );
  } else {
    if (action === "PROMOTE") {
      directives = directives.filter((directive) => directive.action !== "PROMOTE");
    }
    directives = directives.filter(
      (directive) => directive.objective_fingerprint !== fingerprint,
    );
    const directive = {
      directive_id: decisionId({
        actor,
        portfolioId,
        revision: nextRevision,
        action,
        nodeId: target?.node_id,
        timestamp: now,
      }),
      action,
      node_id_at_decision: text(target?.node_id, 200) || null,
      objective: text(target?.objective, 1800),
      objective_fingerprint: fingerprint,
      reason: text(reason, 800) || null,
      created_at: now,
      actor_id: actor,
      source: text(source, 120) || "BUSINESS_PARTNER",
      active: true,
    };
    directives.push(directive);
  }

  control.directives = directives.slice(-MAX_DIRECTIVES);
  control.control_revision = nextRevision;
  const decision = {
    decision_id: decisionId({
      actor,
      portfolioId,
      revision: nextRevision,
      action,
      nodeId: target?.node_id,
      timestamp: now,
    }),
    action,
    node_id: text(target?.node_id, 200) || null,
    objective: text(target?.objective, 1800) || null,
    objective_fingerprint: fingerprint,
    reason: text(reason, 800) || null,
    source: text(source, 120) || "BUSINESS_PARTNER",
    control_revision: nextRevision,
    occurred_at: now,
    active_objective_was_immutable: Boolean(locked),
  };
  control.decision_history = [
    ...list(control.decision_history).map(safeDecision).filter(Boolean),
    decision,
  ].slice(-MAX_HISTORY);
  control.updated_at = now;

  const persisted = await persistProductEngineeringPortfolioOwnerControl({
    context,
    control,
  });
  const governedPortfolio = governProductEngineeringPortfolioWithOwnerControl(
    portfolio,
    persisted.control,
  );
  return {
    applied: true,
    decision,
    control: compactProductEngineeringPortfolioOwnerControl(
      persisted.control,
      governedPortfolio,
    ),
    governed_portfolio: governedPortfolio,
    current_objective_immutable_once_claimed: true,
    source_code_mutated: false,
    commit_performed: false,
    production_deployed: false,
    authorization_effect: "NONE",
  };
}

export const AvantiqoProductEngineeringPortfolioOwnerControlRuntime = Object.freeze({
  contract: AVANTIQO_PRODUCT_ENGINEERING_PORTFOLIO_OWNER_CONTROL_CONTRACT,
  load: loadProductEngineeringPortfolioOwnerControl,
  persist: persistProductEngineeringPortfolioOwnerControl,
  applyDecision: applyProductEngineeringPortfolioOwnerDecision,
  govern: governProductEngineeringPortfolioWithOwnerControl,
  compact: compactProductEngineeringPortfolioOwnerControl,
  attachToProjection: attachOwnerControlToProductEngineeringPortfolioProjection,
  allowsNewCycle: ownerControlAllowsNewEngineeringCycle,
  current_objective_immutable_once_claimed: true,
  owner_controls_future_execution_order_only: true,
  automatic_commit_allowed: false,
  production_deployment_allowed: false,
  authorization_effect: "NONE",
});

export default AvantiqoProductEngineeringPortfolioOwnerControlRuntime;
