import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CACHE_KEY = "__AVANTIQO_OPERATOR_ORGANIZATIONAL_CONTEXT_V1__";
const STATIC_TTL_MS = 5 * 60 * 1000;
const PRIOR_PROJECT_LIMIT = 3;
const HISTORY_LIMIT = 4;

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values = []) {
  return Array.from(new Set(values.map(text).filter(Boolean)));
}

function tokens(value) {
  return unique(
    text(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\u0e00-\u0e7f\s_-]+/g, " ")
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 1),
  ).slice(0, 48);
}

function compactValue(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return text(value).slice(0, 420);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= 3) return null;

  if (Array.isArray(value)) {
    return value
      .slice(0, 16)
      .map((item) => compactValue(item, depth + 1))
      .filter((item) => item !== null && item !== "");
  }

  if (typeof value !== "object") return null;

  const output = {};
  for (const [key, item] of Object.entries(value).slice(0, 32)) {
    const compacted = compactValue(item, depth + 1);
    if (compacted === null || compacted === "") continue;
    if (Array.isArray(compacted) && !compacted.length) continue;
    if (
      compacted &&
      typeof compacted === "object" &&
      !Array.isArray(compacted) &&
      !Object.keys(compacted).length
    ) {
      continue;
    }
    output[key] = compacted;
  }
  return output;
}

function stringsFrom(value, depth = 0, output = []) {
  if (output.length >= 96 || depth > 4 || value === null || value === undefined) {
    return output;
  }

  if (typeof value === "string" || typeof value === "number") {
    const candidate = text(value);
    if (candidate) output.push(candidate);
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      stringsFrom(item, depth + 1, output);
      if (output.length >= 96) break;
    }
    return output;
  }

  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      output.push(text(key));
      stringsFrom(item, depth + 1, output);
      if (output.length >= 96) break;
    }
  }

  return output;
}

function relevance(value, queryTokens) {
  if (!queryTokens.length) return 0;
  const candidateTokens = new Set(tokens(stringsFrom(value).join(" ")));
  if (!candidateTokens.size) return 0;

  let score = 0;
  let total = 0;
  for (const token of queryTokens) {
    const weight = Math.max(1, Math.min(8, token.length - 1));
    total += weight;
    if (candidateTokens.has(token)) score += weight;
  }
  return total > 0 ? score / total : 0;
}

function cacheState() {
  if (!globalThis[CACHE_KEY]) globalThis[CACHE_KEY] = new Map();
  return globalThis[CACHE_KEY];
}

async function staticOrganizationContext(organizationId) {
  const cache = cacheState();
  const existing = cache.get(organizationId);
  const now = Date.now();

  if (existing?.value && now - existing.createdAt < STATIC_TTL_MS) {
    return existing.value;
  }
  if (existing?.promise) return existing.promise;

  const promise = (async () => {
    const [organizationResult, industryResult, profileResult] = await Promise.all([
      supabaseAdmin
        .from("organizations")
        .select(
          "id, name, industry, organization_type, country, default_currency, timezone, status",
        )
        .eq("id", organizationId)
        .maybeSingle(),
      supabaseAdmin
        .from("organization_industries")
        .select("industry_id, status")
        .eq("organization_id", organizationId)
        .eq("status", "ACTIVE"),
      supabaseAdmin
        .from("ai_business_profiles")
        .select("profile, updated_at")
        .eq("organization_id", organizationId)
        .maybeSingle(),
    ]);

    if (organizationResult.error) {
      console.error("OPERATOR_ORGANIZATIONAL_CONTEXT_ORGANIZATION_LOAD_FAILED", {
        organizationId,
        error: organizationResult.error.message || organizationResult.error,
      });
    }
    if (industryResult.error) {
      console.error("OPERATOR_ORGANIZATIONAL_CONTEXT_INDUSTRY_LOAD_FAILED", {
        organizationId,
        error: industryResult.error.message || industryResult.error,
      });
    }
    if (profileResult.error) {
      console.error("OPERATOR_ORGANIZATIONAL_CONTEXT_PROFILE_LOAD_FAILED", {
        organizationId,
        error: profileResult.error.message || profileResult.error,
      });
    }

    const organization = organizationResult.data || null;
    const industries = unique(
      list(industryResult.data).map((row) => row?.industry_id),
    );

    return {
      organization: organization
        ? {
            id: organization.id,
            name: text(organization.name) || null,
            industry: text(organization.industry) || null,
            organization_type: text(organization.organization_type) || null,
            country: text(organization.country) || null,
            default_currency: text(organization.default_currency) || null,
            timezone: text(organization.timezone) || null,
            status: text(organization.status) || null,
          }
        : null,
      registered_industries: industries,
      profile: compactValue(profileResult.data?.profile || null),
      profile_updated_at: text(profileResult.data?.updated_at) || null,
    };
  })();

  cache.set(organizationId, { promise, value: null, createdAt: 0 });

  try {
    const value = await promise;
    cache.set(organizationId, {
      promise: null,
      value,
      createdAt: Date.now(),
    });
    return value;
  } catch (error) {
    cache.delete(organizationId);
    throw error;
  }
}

function projectSnapshot(row) {
  const state = object(row?.project_state);
  return {
    conversation_key: text(row?.conversation_key) || null,
    title: text(row?.title) || null,
    objective: text(state.objective) || null,
    status: text(state.status) || null,
    decisions: list(state.decisions).map(text).filter(Boolean).slice(-8),
    completed_steps: list(state.completed_steps).map(text).filter(Boolean).slice(-8),
    progress_summary: text(state.progress_summary) || null,
    next_step: text(state.next_step) || null,
    blocker: text(state.blocker) || null,
    updated_at: text(row?.last_message_at || row?.updated_at) || null,
  };
}

async function relevantPriorProjects({ organizationId, partyId, queryTokens }) {
  const result = await supabaseAdmin
    .from("intelligence_conversations")
    .select("conversation_key, title, project_state, updated_at, last_message_at")
    .eq("organization_id", organizationId)
    .eq("party_id", partyId)
    .order("last_message_at", { ascending: false })
    .limit(12);

  if (result.error) {
    console.error("OPERATOR_ORGANIZATIONAL_CONTEXT_PROJECT_LOAD_FAILED", {
      organizationId,
      partyId,
      error: result.error.message || result.error,
    });
    return [];
  }

  const projects = list(result.data)
    .map(projectSnapshot)
    .filter((project) => project.objective || project.progress_summary || project.decisions.length)
    .map((project, index) => ({
      project,
      index,
      score: relevance(project, queryTokens),
    }));

  const matched = projects
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, PRIOR_PROJECT_LIMIT)
    .map((entry) => entry.project);

  if (matched.length) return matched;
  return projects.slice(0, 1).map((entry) => entry.project);
}

function historySnapshot(row) {
  const decision = object(row?.decision);
  const execution = object(row?.execution);
  const capability = object(execution.capability);
  const evidence = object(row?.evidence);

  return {
    created_at: text(row?.created_at) || null,
    intent: text(decision.intent) || null,
    status: text(execution.status) || null,
    capability_key:
      text(capability.key || decision?.execution?.capability_key) || null,
    domain: text(capability.domain) || null,
    mode: text(capability.mode) || null,
    verified: Boolean(
      evidence.verification ||
      execution.post_action_verification ||
      text(execution.status).toLowerCase() === "completed",
    ),
  };
}

async function relevantHistory({ organizationId, partyId, queryTokens }) {
  const result = await supabaseAdmin
    .from("intelligence_turns")
    .select("decision, evidence, execution, created_at")
    .eq("organization_id", organizationId)
    .eq("party_id", partyId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(24);

  if (result.error) {
    console.error("OPERATOR_ORGANIZATIONAL_CONTEXT_HISTORY_LOAD_FAILED", {
      organizationId,
      partyId,
      error: result.error.message || result.error,
    });
    return [];
  }

  const history = list(result.data)
    .map(historySnapshot)
    .filter((entry) => entry.capability_key && entry.status)
    .map((entry, index) => ({
      entry,
      index,
      score: relevance(entry, queryTokens),
    }));

  const matched = history
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, HISTORY_LIMIT)
    .map((item) => item.entry);

  if (matched.length) return matched;
  return history.slice(0, 2).map((item) => item.entry);
}

function queryContext(message, projectState) {
  const state = object(projectState);
  return [
    text(message),
    text(state.objective),
    ...list(state.decisions).slice(-6).map(text),
    text(state.progress_summary),
    text(state.next_step),
    text(state.blocker),
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 3600);
}

export async function loadOperatorOrganizationalContext({
  organizationId,
  partyId,
  message,
  projectState = {},
} = {}) {
  if (!text(organizationId) || !text(partyId)) return null;

  const queryTokens = tokens(queryContext(message, projectState));

  try {
    const [staticContext, priorProjects, history] = await Promise.all([
      staticOrganizationContext(organizationId),
      relevantPriorProjects({ organizationId, partyId, queryTokens }),
      relevantHistory({ organizationId, partyId, queryTokens }),
    ]);

    return {
      version: 1,
      organization: staticContext?.organization || null,
      registered_industries: list(staticContext?.registered_industries),
      profile: staticContext?.profile || null,
      profile_updated_at: staticContext?.profile_updated_at || null,
      relevant_prior_goals: priorProjects,
      relevant_verified_history: history,
      generated_at: new Date().toISOString(),
    };
  } catch (error) {
    console.error("OPERATOR_ORGANIZATIONAL_CONTEXT_LOAD_FAILED", {
      organizationId,
      partyId,
      error: error?.message || error,
    });
    return null;
  }
}

export function operatorOrganizationalRankingText(context = {}) {
  const source = object(context);
  return stringsFrom({
    organization: source.organization,
    registered_industries: source.registered_industries,
    profile: source.profile,
    relevant_prior_goals: source.relevant_prior_goals,
    relevant_verified_history: source.relevant_verified_history,
  })
    .join(" ")
    .slice(0, 2400);
}

export function clearOperatorOrganizationalContextCache(organizationId = null) {
  const cache = cacheState();
  if (text(organizationId)) {
    cache.delete(text(organizationId));
    return;
  }
  cache.clear();
}

export default loadOperatorOrganizationalContext;
