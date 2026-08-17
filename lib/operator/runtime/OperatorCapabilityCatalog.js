import {
  getDomainRuntime,
  listDomainRuntimeNames,
} from "@/lib/ubte/runtime/domains/DomainRuntimeRegistry";

const CACHE_KEY = "__AVANTIQO_OPERATOR_CAPABILITY_CATALOG_V1__";
const CACHE_TTL_MS = 5 * 60 * 1000;
const OPERATOR_READ_CHAIN_KEY = "platform.operator_read_chain.execute";
const OPERATOR_READ_CHAIN_SEARCH_TAGS = Object.freeze([
  "multi-source",
  "multi-part",
  "cross-domain",
  "compare",
  "comparison",
  "diagnose",
  "diagnosis",
  "explain",
  "why",
  "business-health",
  "sales",
  "cash",
  "finance",
  "inventory",
  "payroll",
  "operations",
  "marketing",
  "customers",
]);

function text(value) {
  return String(value ?? "").trim();
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

function inferredMode(manifest = {}) {
  const explicit = text(manifest.operatorMode || manifest.operator_mode).toLowerCase();
  if (["read", "draft", "write", "approve", "navigate"].includes(explicit)) {
    return explicit;
  }

  const key = `${manifest.capability || ""}.${manifest.action || ""}`.toLowerCase();
  if (/^(get|list|read|find|search|view|summarize|analyse|analyze|report)/.test(key)) {
    return "read";
  }
  if (/(approve|post|close|delete|archive|pay|release|refund|reversal|lock|reopen)/.test(key)) {
    return "approve";
  }
  if (/(create|update|change|move|transfer|merge|upsert|send|submit|queue|start)/.test(key)) {
    return "write";
  }
  return "write";
}

function fallbackDescription(domain, capability, action) {
  return `${domain}.${capability}.${action}`;
}

function capabilityKey(domain, capability, action) {
  return `${domain}.${capability}.${action}`;
}

function capabilityDescription({ domain, capability, action, manifest }) {
  const description =
    text(manifest?.description) || fallbackDescription(domain, capability, action);

  if (capabilityKey(domain, capability, action) !== OPERATOR_READ_CHAIN_KEY) {
    return description;
  }

  return `${description} Prefer this bounded read-only chain when one user question needs evidence from two or more registered reads or business areas, then synthesize one answer from the returned evidence.`;
}

function capabilityTags({ domain, capability, action, manifest }) {
  const tags = Array.isArray(manifest?.tags) ? manifest.tags : [];
  if (capabilityKey(domain, capability, action) !== OPERATOR_READ_CHAIN_KEY) {
    return tags;
  }

  return Array.from(
    new Set([...tags, ...OPERATOR_READ_CHAIN_SEARCH_TAGS].map(text).filter(Boolean)),
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

async function buildCatalog() {
  const output = [];

  for (const domain of listDomainRuntimeNames()) {
    let runtime;
    try {
      runtime = await getDomainRuntime(domain);
    } catch {
      continue;
    }

    for (const [capability, actions] of Object.entries(runtime?.capabilities || {})) {
      for (const [action, loader] of Object.entries(actions || {})) {
        if (typeof loader !== "function") continue;

        let module;
        try {
          module = await loader();
        } catch {
          continue;
        }

        const manifest = module?.manifest || null;
        const aiEnabled = manifest?.aiEnabled === true;
        const operatorEnabled =
          manifest?.operatorEnabled === true ||
          manifest?.operator_enabled === true ||
          aiEnabled;

        if (!operatorEnabled) continue;

        const mode = inferredMode({
          ...manifest,
          capability,
          action,
        });

        output.push({
          key: capabilityKey(domain, capability, action),
          domain,
          capability,
          action,
          description: capabilityDescription({
            domain,
            capability,
            action,
            manifest,
          }),
          permissions: Array.isArray(manifest?.permissions)
            ? manifest.permissions
            : [],
          events: Array.isArray(manifest?.events)
            ? manifest.events
            : [],
          tags: capabilityTags({
            domain,
            capability,
            action,
            manifest,
          }),
          context_scope: normalizeContextScope(
            manifest?.contextScope ||
            manifest?.context_scope ||
            manifest?.scope,
          ),
          input_schema:
            manifest?.inputSchema ||
            manifest?.input_schema ||
            null,
          output_schema:
            manifest?.outputSchema ||
            manifest?.output_schema ||
            null,
          mode,
          risk: normalizeRisk(
            manifest?.risk ||
            manifest?.riskLevel ||
            manifest?.risk_level,
          ),
          approval:
            manifest?.approval ||
            manifest?.approvalPolicy ||
            manifest?.approval_policy ||
            null,
          reversible:
            manifest?.reversible === true ||
            Boolean(manifest?.compensatingCapability || manifest?.compensating_capability),
          transactional: manifest?.transactional === true,
          auto_execute:
            manifest?.operatorAutoExecute === true ||
            manifest?.operator_auto_execute === true ||
            mode === "read",
          requires_confirmation:
            manifest?.operatorRequiresConfirmation === true ||
            manifest?.operator_requires_confirmation === true ||
            mode === "approve" ||
            ["high", "critical"].includes(
              normalizeRisk(
                manifest?.risk ||
                manifest?.riskLevel ||
                manifest?.risk_level,
              ),
            ),
          ai_enabled: aiEnabled,
          operator_enabled: operatorEnabled,
        });
      }
    }
  }

  return output.sort((a, b) => a.key.localeCompare(b.key));
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
