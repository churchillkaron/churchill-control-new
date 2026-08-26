import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { ERP_REGISTRY } from "@/lib/platform/registry/erpRegistry.js";
import { serializeCapability } from "@/lib/platform/registry/serializeCapability";
import { AVANTIQO_PRODUCT_CONSTITUTION } from "@/lib/intelligence/runtime/AvantiqoProductConstitution";

export const AVANTIQO_INTERNAL_PRODUCT_KNOWLEDGE_CONTRACT =
  "AVANTIQO_INTERNAL_PRODUCT_KNOWLEDGE_V1";

const MEMORY_TABLE = "intelligence_memories";
const KNOWLEDGE_SCOPE = "platform_knowledge";
const INTERNAL_SOURCE = "avantiqo_canonical_product_knowledge";
const INTERNAL_AUTHORITY = "AVANTIQO_CANONICAL_PRODUCT";
const MAX_UNIT_CONTENT = 12000;
const UPSERT_BATCH_SIZE = 150;
const FORBIDDEN_KEY = /(password|secret|token|api[_-]?key|authorization|credential|cookie)/i;

function text(value, limit = MAX_UNIT_CONTENT) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function stableHash(value) {
  return createHash("sha256")
    .update(text(value, 40000))
    .digest("hex");
}

function safeValue(value, depth = 0) {
  if (depth > 7) return null;
  if (value === null || value === undefined) return null;
  if (["string", "number", "boolean"].includes(typeof value)) {
    return typeof value === "string" ? text(value, 3000) : value;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 80)
      .map((entry) => safeValue(entry, depth + 1))
      .filter((entry) => entry !== null);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !FORBIDDEN_KEY.test(key))
        .slice(0, 120)
        .map(([key, entry]) => [key, safeValue(entry, depth + 1)])
        .filter(([, entry]) => entry !== null),
    );
  }
  return null;
}

function registryRoot() {
  const serialized = serializeCapability(ERP_REGISTRY);
  if (serialized?.workspaces) return serialized;
  return Object.values(object(serialized)).find((value) => value?.workspaces) || {};
}

function compactAction(action = {}) {
  const item = object(action);
  return safeValue({
    id: item.id || null,
    type: item.type || null,
    label: item.label || item.title || null,
    action: item.action || null,
    capability: item.capability || null,
    engine: item.engine || null,
    form: item.form || null,
    schema: item.schema || null,
    document: item.document || null,
    endpoint: item.endpoint || item.api || null,
    method: item.method || null,
    danger: item.danger === true,
  });
}

function compactWorkspaceItem(item = {}) {
  const source = object(item);
  return safeValue({
    id: source.id || null,
    name: source.name || null,
    route: source.route || null,
    description: source.description || null,
    status: source.status || null,
    type: source.type || null,
    context_scope: source.contextScope || source.context_scope || source.data?.scope || null,
    document: source.document || null,
    create: source.create
      ? {
          enabled: source.create.enabled !== false,
          id: source.create.id || null,
          type: source.create.type || null,
          engine: source.create.engine || null,
          capability: source.create.capability || null,
          action: source.create.action || null,
          form: source.create.form || null,
          schema: source.create.schema || null,
          label: source.create.label || source.create.title || null,
          endpoint: source.create.endpoint || source.create.api || null,
          method: source.create.method || null,
        }
      : null,
    runtime: source.runtime
      ? {
          renderer: source.runtime.renderer || null,
          list_api: source.runtime.listApi || null,
          create_api: source.runtime.createApi || null,
          rows_key: source.runtime.rowsKey || null,
        }
      : null,
    data: source.data
      ? {
          capability: source.data.capability || null,
          repository: source.data.repository || null,
          application_service: source.data.applicationService || null,
          identity: source.data.identity || null,
          scope: source.data.scope || null,
        }
      : null,
    ui: source.ui
      ? {
          api: source.ui.api || null,
          rows_key: source.ui.rowsKey || null,
          name_field: source.ui.nameField || null,
          search: list(source.ui.search).slice(0, 40),
        }
      : null,
    actions: list(source.actions).map(compactAction),
    top_menu: list(source.topMenu || source.ui?.topMenu).map(compactAction),
    row_menu: list(source.rowMenu || source.ui?.rowMenu).map(compactAction),
    commands: list(source.commands).map(compactAction),
    engines: list(source.engines).map((entry) => text(entry, 160)).filter(Boolean),
    sub_workspaces: list(source.workspaces).map((workspace) => ({
      id: text(workspace?.id, 160) || null,
      title: text(workspace?.title, 300) || null,
      engine: text(workspace?.engine, 160) || null,
      renderer: text(workspace?.renderer, 160) || null,
    })),
  });
}

function memoryKey(reference) {
  return `internal-product:${stableHash(reference).slice(0, 40)}`;
}

function unit({
  reference,
  subject,
  content,
  domain = null,
  objectType,
  importance = 0.9,
  metadata = {},
}) {
  const normalized = text(content, MAX_UNIT_CONTENT);
  return {
    reference,
    subject: text(subject, 500),
    content: normalized,
    domain: text(domain, 120) || null,
    object_type: objectType,
    importance: Math.max(0, Math.min(1, Number(importance) || 0.9)),
    fingerprint: stableHash(normalized),
    metadata: safeValue(metadata) || {},
  };
}

function constitutionUnits() {
  const constitution = object(AVANTIQO_PRODUCT_CONSTITUTION);
  const units = [
    unit({
      reference: "AVANTIQO_PRODUCT_CONSTITUTION:purpose",
      subject: "Avantiqo product purpose",
      content: text(constitution.purpose, 8000),
      domain: "platform",
      objectType: "product_constitution",
      importance: 1,
    }),
  ];

  for (const section of [
    "architecture",
    "intelligence",
    "execution",
    "engineering",
    "economics",
    "definition_of_done",
  ]) {
    for (const [index, statement] of list(constitution[section]).entries()) {
      const content = text(statement, 8000);
      if (!content) continue;
      units.push(unit({
        reference: `AVANTIQO_PRODUCT_CONSTITUTION:${section}:${index + 1}`,
        subject: `Avantiqo ${section.replaceAll("_", " ")} rule ${index + 1}`,
        content,
        domain: section === "economics" ? "services" : "platform",
        objectType: "product_constitution",
        importance: 1,
        metadata: { constitution_section: section, constitution_index: index + 1 },
      }));
    }
  }
  return units;
}

function registryUnits() {
  const registry = registryRoot();
  const units = [];
  const domains = list(registry.domains);
  const solutions = list(registry.solutions);
  const workspaces = object(registry.workspaces);

  units.push(unit({
    reference: "ERP_REGISTRY:summary",
    subject: "Avantiqo canonical product registry",
    content: [
      "ERP_REGISTRY is Avantiqo's canonical product/workspace/action registry.",
      `Domains: ${domains.map((entry) => text(entry?.name || entry?.id, 160)).filter(Boolean).join(", ")}.`,
      `Solutions: ${solutions.map((entry) => text(entry?.name || entry?.id, 160)).filter(Boolean).join(", ")}.`,
    ].join(" "),
    domain: "platform",
    objectType: "registry_summary",
    importance: 1,
    metadata: {
      domain_count: domains.length,
      solution_count: solutions.length,
      workspace_domain_count: Object.keys(workspaces).length,
    },
  }));

  for (const domain of domains) {
    const id = text(domain?.id, 160);
    if (!id) continue;
    units.push(unit({
      reference: `ERP_REGISTRY:domain:${id}`,
      subject: `Avantiqo domain ${text(domain?.name || id, 300)}`,
      content: [
        `Canonical Avantiqo domain: ${text(domain?.name || id, 300)} (${id}).`,
        text(domain?.description, 4000),
        domain?.route ? `Route: ${text(domain.route, 500)}.` : "",
        domain?.type ? `Type: ${text(domain.type, 120)}.` : "",
      ].filter(Boolean).join(" "),
      domain: id,
      objectType: "registry_domain",
      importance: 0.94,
      metadata: safeValue(domain),
    }));
  }

  for (const solution of solutions) {
    const id = text(solution?.id, 160);
    if (!id) continue;
    units.push(unit({
      reference: `ERP_REGISTRY:solution:${id}`,
      subject: `Avantiqo solution ${text(solution?.name || id, 300)}`,
      content: `Canonical Avantiqo solution ${text(solution?.name || id, 300)} (${id})${solution?.route ? ` at ${text(solution.route, 500)}` : ""}.`,
      domain: "solutions",
      objectType: "registry_solution",
      importance: 0.84,
      metadata: safeValue(solution),
    }));
  }

  for (const [domainId, workspace] of Object.entries(workspaces)) {
    for (const group of list(workspace?.groups)) {
      const groupId = text(group?.id || group?.name, 180) || "ungrouped";
      for (const item of list(group?.items)) {
        const itemId = text(item?.id, 180);
        if (!itemId) continue;
        const compact = compactWorkspaceItem(item);
        const status = text(item?.status, 80).toLowerCase();
        const reference = `ERP_REGISTRY:workspace:${domainId}:${groupId}:${itemId}`;
        const introduction = [
          `Canonical Avantiqo workspace: ${text(item?.name || itemId, 300)} (${domainId}.${itemId}).`,
          text(item?.description, 4000),
          `Registry group: ${text(group?.name || groupId, 300)}.`,
          status ? `Status: ${status}.` : "",
        ].filter(Boolean).join(" ");
        units.push(unit({
          reference,
          subject: `Avantiqo workspace ${domainId}.${itemId}`,
          content: `${introduction} Contract: ${JSON.stringify(compact)}`,
          domain: domainId,
          objectType: "registry_workspace",
          importance: status === "active" ? 0.96 : status === "planned" ? 0.8 : 0.88,
          metadata: {
            workspace_id: itemId,
            workspace_name: text(item?.name, 300) || null,
            group_id: groupId,
            group_name: text(group?.name, 300) || null,
            status: status || null,
            route: text(item?.route, 1000) || null,
            document: text(item?.document, 300) || null,
            create_form: text(item?.create?.form, 300) || null,
            create_schema: safeValue(item?.create?.schema),
            create_enabled: item?.create?.enabled === true,
          },
        }));
      }
    }
  }

  return units;
}

export function buildAvantiqoInternalProductKnowledgeUnits() {
  const units = [...constitutionUnits(), ...registryUnits()];
  const byReference = new Map();
  for (const entry of units) byReference.set(entry.reference, entry);
  return [...byReference.values()];
}

function memoryRow({ organizationId, entry, nowIso }) {
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: KNOWLEDGE_SCOPE,
    memory_key: memoryKey(entry.reference),
    memory_type: "fact",
    subject: entry.subject,
    content: entry.content,
    importance: entry.importance,
    confidence: 1,
    source: INTERNAL_SOURCE,
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      ...object(entry.metadata),
      reusable_platform_knowledge: true,
      internal_authoritative: true,
      authority: INTERNAL_AUTHORITY,
      internal_reference: entry.reference,
      product_object_type: entry.object_type,
      knowledge_domain: entry.domain,
      stability: "mutable",
      content_fingerprint: entry.fingerprint,
      verified_at: nowIso,
      customer_private_memory: false,
      customer_private_content_included: false,
      raw_customer_turn_included: false,
      raw_payload_included: false,
      raw_output_included: false,
      raw_reasoning_persisted: false,
      identifiers_persisted: false,
      authorization_value: "none",
    },
    updated_at: nowIso,
  };
}

async function upsertBatches(rows) {
  let written = 0;
  for (let index = 0; index < rows.length; index += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(index, index + UPSERT_BATCH_SIZE);
    const result = await supabaseAdmin
      .from(MEMORY_TABLE)
      .upsert(batch, { onConflict: "organization_id,memory_scope,memory_key" })
      .select("id");
    if (result.error) throw result.error;
    written += list(result.data).length;
  }
  return written;
}

export async function syncAvantiqoInternalProductKnowledge({ organizationId = null } = {}) {
  const organization = text(organizationId, 160) || learningOrganizationId();
  if (!organization) {
    return {
      contract: AVANTIQO_INTERNAL_PRODUCT_KNOWLEDGE_CONTRACT,
      available: false,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      unit_count: 0,
      written_count: 0,
      retired_count: 0,
    };
  }

  const units = buildAvantiqoInternalProductKnowledgeUnits();
  const desiredKeys = new Set(units.map((entry) => memoryKey(entry.reference)));
  const existing = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,active,metadata")
    .eq("organization_id", organization)
    .eq("memory_scope", KNOWLEDGE_SCOPE)
    .eq("source", INTERNAL_SOURCE)
    .limit(5000);
  if (existing.error) throw existing.error;

  const existingByKey = new Map(
    list(existing.data).map((row) => [text(row.memory_key, 160), row]),
  );
  const nowIso = new Date().toISOString();
  const changedRows = units
    .filter((entry) => {
      const key = memoryKey(entry.reference);
      const row = existingByKey.get(key);
      const metadata = object(row?.metadata);
      return (
        !row ||
        row.active !== true ||
        text(metadata.content_fingerprint, 128) !== entry.fingerprint ||
        metadata.internal_authoritative !== true ||
        text(metadata.authority, 120) !== INTERNAL_AUTHORITY
      );
    })
    .map((entry) => memoryRow({ organizationId: organization, entry, nowIso }));

  const staleIds = list(existing.data)
    .filter((row) => row.active === true && !desiredKeys.has(text(row.memory_key, 160)))
    .map((row) => row.id)
    .filter(Boolean);

  const writtenCount = await upsertBatches(changedRows);
  let retiredCount = 0;
  if (staleIds.length) {
    const retired = await supabaseAdmin
      .from(MEMORY_TABLE)
      .update({ active: false, superseded_at: nowIso, updated_at: nowIso })
      .eq("organization_id", organization)
      .eq("memory_scope", KNOWLEDGE_SCOPE)
      .eq("source", INTERNAL_SOURCE)
      .in("id", staleIds)
      .select("id");
    if (retired.error) throw retired.error;
    retiredCount = list(retired.data).length;
  }

  return {
    contract: AVANTIQO_INTERNAL_PRODUCT_KNOWLEDGE_CONTRACT,
    available: true,
    status: "SYNCED",
    unit_count: units.length,
    written_count: writtenCount,
    unchanged_count: Math.max(0, units.length - changedRows.length),
    retired_count: retiredCount,
    governance: {
      canonical_product_sources_only: true,
      customer_private_memory_used: false,
      raw_customer_turns_used: false,
      raw_payloads_used: false,
      raw_outputs_used: false,
      raw_reasoning_used: false,
      authorization_effect: "NONE",
      model_weight_mutation: false,
      provider_execution_used: false,
    },
  };
}

export const AvantiqoInternalProductKnowledgeRuntime = Object.freeze({
  contract: AVANTIQO_INTERNAL_PRODUCT_KNOWLEDGE_CONTRACT,
  buildUnits: buildAvantiqoInternalProductKnowledgeUnits,
  sync: syncAvantiqoInternalProductKnowledge,
});
