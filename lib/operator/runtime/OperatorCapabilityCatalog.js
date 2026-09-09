import {
  getDomainRuntime,
  listDomainRuntimeNames,
} from "@/lib/ubte/runtime/domains/DomainRuntimeRegistry";

const CACHE_KEY = "__AVANTIQO_OPERATOR_CAPABILITY_CATALOG_V2__";
const CACHE_TTL_MS = 5 * 60 * 1000;
const CATALOG_LOAD_CONCURRENCY = 16;

function text(value) {
  return String(value ?? "").trim();
}

function values(value) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function normalizeRisk(value) {
  const risk = text(value).toLowerCase();
  if (["low", "medium", "high", "critical"].includes(risk)) return risk;
  return "medium";
}

function normalizeContextScope(value) {
  const scope = text(value).toLowerCase();
  return ["organization", "entity"].includes(scope) ? scope : null;
}

function normalizeMode(manifest = {}) {
  const explicit = text(
    manifest.operatorMode ||
    manifest.operator_mode ||
    manifest.mode,
  ).toLowerCase();

  if (["read", "draft", "write", "approve", "navigate"].includes(explicit)) {
    return explicit;
  }

  return "write";
}

function fallbackDescription(domain, capability, action) {
  return `${domain}.${capability}.${action}`;
}

const SECRETARY_WRITE_PERMISSION = "management.manage";

function normalizedPermissions(manifest = {}, { domain, capability, mode } = {}) {
  const declared = values(manifest?.permissions);
  if (declared.length) return declared;
  if (
    domain === "platform" &&
    (text(capability) === "secretary" || text(capability).startsWith("secretary_")) &&
    mode !== "read"
  ) {
    return [SECRETARY_WRITE_PERMISSION];
  }
  return [];
}

function normalizedRequiresConfirmation(manifest = {}, { domain, capability, mode, risk } = {}) {
  if (
    manifest?.operatorRequiresConfirmation === true ||
    manifest?.operator_requires_confirmation === true ||
    mode === "approve" ||
    ["high", "critical"].includes(risk)
  ) {
    return true;
  }
  return Boolean(
    domain === "platform" &&
    (text(capability) === "secretary" || text(capability).startsWith("secretary_")) &&
    mode !== "read"
  );
}

function cacheState() {
  if (!globalThis[CACHE_KEY]) {
    globalThis[CACHE_KEY] = {
      value: null,
      createdAt: 0,
      promise: null,
    };
  }
  return globalThis[CACHE_KEY];
}

async function boundedParallelMap(items, worker, concurrency = CATALOG_LOAD_CONCURRENCY) {
  const source = Array.isArray(items) ? items : [];
  if (!source.length) return [];
  const output = new Array(source.length);
  let cursor = 0;
  const count = Math.max(1, Math.min(concurrency, source.length));
  await Promise.all(Array.from({ length: count }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= source.length) return;
      output[index] = await worker(source[index], index);
    }
  }));
  return output;
}

async function buildCatalog() {
  const domainNames = listDomainRuntimeNames();
  const domainRows = await boundedParallelMap(domainNames, async (domain) => {
    try {
      return { domain, runtime: await getDomainRuntime(domain) };
    } catch {
      return null;
    }
  });

  const candidates = [];
  for (const row of domainRows.filter(Boolean)) {
    for (const [capability, actions] of Object.entries(row.runtime?.capabilities || {})) {
      for (const [action, loader] of Object.entries(actions || {})) {
        if (typeof loader === "function") {
          candidates.push({ domain: row.domain, capability, action, loader });
        }
      }
    }
  }

  const loaded = await boundedParallelMap(candidates, async (candidate) => {
    let module;
    try {
      module = await candidate.loader();
    } catch {
      return null;
    }
    const manifest = module?.manifest || null;
    const aiEnabled = manifest?.aiEnabled === true;
    const operatorEnabled =
      manifest?.operatorEnabled === true ||
      manifest?.operator_enabled === true ||
      aiEnabled;
    if (!operatorEnabled) return null;
    const mode = normalizeMode(manifest || {});
    return {
      key: `${candidate.domain}.${candidate.capability}.${candidate.action}`,
      domain: candidate.domain,
      capability: candidate.capability,
      action: candidate.action,
      name: text(manifest?.name || manifest?.title) || null,
      document: text(manifest?.document || manifest?.documentType || manifest?.document_type) || null,
      group_name: text(manifest?.groupName || manifest?.group_name) || null,
      search_text: text(manifest?.searchText || manifest?.search_text) || null,
      description: text(manifest?.description) || fallbackDescription(candidate.domain, candidate.capability, candidate.action),
      operator_aliases: values(manifest?.operatorAliases || manifest?.operator_aliases || manifest?.aliases),
      operator_examples: values(manifest?.operatorExamples || manifest?.operator_examples || manifest?.examples),
      permissions: normalizedPermissions(manifest || {}, { domain: candidate.domain, capability: candidate.capability, mode }),
      events: values(manifest?.events),
      tags: values(manifest?.tags),
      context_scope: normalizeContextScope(manifest?.contextScope || manifest?.context_scope || manifest?.scope),
      input_schema: manifest?.inputSchema || manifest?.input_schema || null,
      output_schema: manifest?.outputSchema || manifest?.output_schema || null,
      mode,
      risk: normalizeRisk(manifest?.risk || manifest?.riskLevel || manifest?.risk_level),
      approval: manifest?.approval || manifest?.approvalPolicy || manifest?.approval_policy || null,
      reversible: manifest?.reversible === true || Boolean(manifest?.compensatingCapability || manifest?.compensating_capability),
      transactional: manifest?.transactional === true,
      auto_execute: manifest?.operatorAutoExecute === true || manifest?.operator_auto_execute === true || mode === "read",
      requires_confirmation: normalizedRequiresConfirmation(manifest || {}, { domain: candidate.domain, capability: candidate.capability, mode, risk: normalizeRisk(manifest?.risk || manifest?.riskLevel || manifest?.risk_level) }),
      ai_enabled: aiEnabled,
      operator_enabled: operatorEnabled,
    };
  });

  return loaded.filter(Boolean).sort((a, b) => a.key.localeCompare(b.key));
}

async function cachedCatalog() {
  const state = cacheState();
  const now = Date.now();

  if (Array.isArray(state.value) && now - state.createdAt < CACHE_TTL_MS) {
    return state.value;
  }

  if (state.promise) return state.promise;

  state.promise = buildCatalog()
    .then((value) => {
      state.value = value;
      state.createdAt = Date.now();
      return value;
    })
    .finally(() => {
      state.promise = null;
    });

  return state.promise;
}

export async function listOperatorCapabilities({
  includeUnsafe = false,
} = {}) {
  const catalog = await cachedCatalog();

  if (includeUnsafe) {
    return catalog;
  }

  return catalog.filter((item) => item.operator_enabled === true);
}

export function clearOperatorCapabilityCatalogCache() {
  const state = cacheState();
  state.value = null;
  state.createdAt = 0;
  state.promise = null;
}
