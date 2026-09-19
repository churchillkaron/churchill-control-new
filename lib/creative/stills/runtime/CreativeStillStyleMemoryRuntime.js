import crypto from "node:crypto";

const CONTRACT = "CREATIVE_STILL_STYLE_MEMORY_V1";
const LIBRARY_CONTRACT = "CREATIVE_STILL_STYLE_MEMORY_LIBRARY_V1";

async function projectRuntime() {
  const module = await import("@/lib/creative/projects/runtime/CreativeProjectRuntime");
  return module.CreativeProjectRuntime;
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function unique(values = []) {
  return [...new Set(list(values).flat(Infinity).map(text).filter(Boolean))];
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
  );
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function explicitStyle(project = {}, task = {}) {
  const metadata = object(project.metadata);
  const requirements = object(task.input?.requirements || task.metadata?.requirements);
  const expected = object(requirements.expected_contract);
  const design = object(task.input?.design || requirements.design || metadata.design_system);
  const creative = object(
    expected.visual_direction || expected.art_direction || metadata.visual_direction || metadata.style_system,
  );
  return {
    creative_system: object(creative.creative_system || metadata.creative_system),
    style_system: object(creative.style_system || creative),
    typography_system: object(creative.typography_system || metadata.typography_system),
    design_system: design,
  };
}

function qualityEvidence(semanticReview = {}) {
  const root = object(semanticReview?.output?.output || semanticReview?.output || semanticReview);
  const result = object(root.result || root.review || root.validation || root);
  const scores = object(result.scores);
  const field = (name) => finite(scores[name] ?? result[name]);
  return {
    overall_score: field("overall_score"),
    composition_score: field("composition_score"),
    depth_score: field("depth_score"),
    lighting_quality_score: field("lighting_quality_score"),
    material_realism_score: field("material_realism_score"),
    production_design_score: field("production_design_score"),
    visual_hierarchy_score: field("visual_hierarchy_score"),
    place_specificity_score: field("place_specificity_score"),
    scale_readability_score: field("scale_readability_score"),
  };
}
export function deriveCreativeStillStyleMemory({ project = {}, task = {}, design = {}, semantic_review = {}, artifact = {} } = {}) {
  const style = explicitStyle(project, task);
  const resolvedDesign = Object.keys(object(design)).length ? object(design) : style.design_system;
  const typography = list(resolvedDesign.text_layers).map((layer) => ({
    role: text(layer.role),
    font_family: text(layer.font_family),
    font_weight: text(layer.font_weight),
    align: text(layer.align),
    fill: text(layer.fill),
  })).filter((entry) => entry.role || entry.font_family);
  const variants = list(resolvedDesign.variants).map((variant) => ({
    id: text(variant.id),
    channel: text(variant.channel),
    width: finite(variant.width),
    height: finite(variant.height),
    fit: text(variant.fit),
    position: text(variant.position),
  }));
  const memory = {
    contract: CONTRACT,
    source: "APPROVED_RELEASE_EVIDENCE_ONLY",
    organization_id: project.organization_id || task.organization_id || null,
    creative_project_id: project.id || task.creative_project_id || null,
    source_validation_task_id: task.id || null,
    style_key: text(project.metadata?.style_key || project.metadata?.campaign_style_key || project.metadata?.brand_system_id) || null,
    approved_style: {
      creative_system: style.creative_system,
      style_system: style.style_system,
      typography_system: style.typography_system,
      typography,
      variants,
      exact_brand_asset_ids: unique(artifact.exact_brand_asset_ids),
    },
    quality_evidence: qualityEvidence(semantic_review),
    policies: {
      memory_requires_release_pass: true,
      inferred_provider_parameters_forbidden: true,
      provider_instructions_are_not_style_memory: true,
      exact_brand_truth_cannot_be_learned_from_generated_pixels: true,
    },
  };
  return Object.freeze({ ...memory, memory_hash: digest(memory) });
}

function memoryFromProject(project = {}) {
  const memory = object(project.metadata?.creative_still_style_memory);
  return memory.contract === CONTRACT && text(memory.memory_hash) ? memory : null;
}
function signature(memory = {}) {
  const style = object(memory.approved_style);
  const dimensions = {
    creative_system: object(style.creative_system),
    style_system: object(style.style_system),
    typography_system: object(style.typography_system),
    typography: list(style.typography),
  };
  return Object.fromEntries(
    Object.entries(dimensions).map(([key, value]) => [
      key,
      Object.keys(object(value)).length || list(value).length ? digest(value) : null,
    ]),
  );
}

export function evaluateCreativeStillStyleDrift({ memory = {}, candidate = {}, evolution_scope = [] } = {}) {
  const baseline = signature(memory);
  const current = signature(candidate);
  const allowed = new Set(list(evolution_scope).map(text));
  const checks = {};
  const drift = [];
  for (const key of Object.keys(baseline)) {
    const comparable = Boolean(baseline[key] && current[key]);
    const changed = comparable && baseline[key] !== current[key];
    const intentionallyEvolved = changed && allowed.has(key);
    checks[key] = {
      comparable,
      changed,
      intentionally_evolved: intentionallyEvolved,
      passed: !changed || intentionallyEvolved,
    };
    if (changed && !intentionallyEvolved) drift.push(key);
  }
  const comparableCount = Object.values(checks).filter((check) => check.comparable).length;
  const passedCount = Object.values(checks).filter((check) => check.comparable && check.passed).length;
  return Object.freeze({
    contract: "CREATIVE_STILL_STYLE_DRIFT_V1",
    passed: drift.length === 0,
    score: comparableCount ? Math.round((passedCount / comparableCount) * 100) : null,
    drift_dimensions: drift,
    evolution_scope: [...allowed],
    checks,
    policy: "DRIFT_REQUIRES_EXPLICIT_EVOLUTION_SCOPE",
  });
}

export function selectCreativeStillStyleMemory({ library = {}, style_key = null, channels = [] } = {}) {
  const memories = list(library.memories || library);
  const channelSet = new Set(list(channels).map((item) => text(item).toLowerCase()).filter(Boolean));
  const requestedStyleKey = text(style_key);
  const scored = memories.map((memory, index) => {
    const memoryChannels = new Set(list(memory?.approved_style?.variants).map((variant) => text(variant?.channel).toLowerCase()).filter(Boolean));
    const channelMatches = [...channelSet].filter((channel) => memoryChannels.has(channel)).length;
    const styleKeyMatch = Boolean(requestedStyleKey && text(memory?.style_key) === requestedStyleKey);
    return { memory, index, score: (styleKeyMatch ? 1000 : 0) + (channelMatches * 100) - index };
  }).sort((left, right) => right.score - left.score);
  return Object.freeze({
    contract: "CREATIVE_STILL_STYLE_MEMORY_SELECTION_V1",
    selected: scored[0]?.memory || null,
    candidates: scored.map((entry) => ({ memory_hash: entry.memory?.memory_hash || null, score: entry.score })),
    policy: "STYLE_KEY_THEN_CHANNEL_COMPATIBILITY_THEN_RECENCY",
  });
}

export async function listOrganizationCreativeStillStyleMemory(organization_id) {
  if (!organization_id) throw new Error("organization_id required");
  const CreativeProjectRuntime = await projectRuntime();
  const projects = await CreativeProjectRuntime.list({ organization_id });
  const memories = projects.map((project) => memoryFromProject(project)).filter(Boolean);
  return Object.freeze({
    contract: LIBRARY_CONTRACT,
    organization_id,
    memories,
    count: memories.length,
    provider_prompts_included: false,
  });
}
export async function persistApprovedCreativeStillStyleMemory({ project_id, task, design, semantic_review, artifact, release_validation } = {}) {
  if (!project_id) throw new Error("creative_project_id required");
  if (release_validation?.passed !== true) {
    throw new Error("CREATIVE_STILL_STYLE_MEMORY_RELEASE_PASS_REQUIRED");
  }
  const CreativeProjectRuntime = await projectRuntime();
  const project = await CreativeProjectRuntime.get(project_id);
  if (!project) throw new Error("Creative project not found");
  if (task?.organization_id && String(project.organization_id) !== String(task.organization_id)) {
    throw new Error("Creative project not found in organization scope");
  }
  const memory = deriveCreativeStillStyleMemory({
    project,
    task,
    design,
    semantic_review,
    artifact,
  });
  const metadata = {
    ...object(project.metadata),
    creative_still_style_memory: memory,
    creative_still_style_memory_updated_at: new Date().toISOString(),
  };
  const updated = await CreativeProjectRuntime.update(project.id, { metadata });
  return Object.freeze({ memory, project: updated });
}

export const CreativeStillStyleMemoryRuntime = Object.freeze({
  contract: CONTRACT,
  library_contract: LIBRARY_CONTRACT,
  derive: deriveCreativeStillStyleMemory,
  evaluateDrift: evaluateCreativeStillStyleDrift,
  select: selectCreativeStillStyleMemory,
  listOrganization: listOrganizationCreativeStillStyleMemory,
  persistApproved: persistApprovedCreativeStillStyleMemory,
});

export default CreativeStillStyleMemoryRuntime;
