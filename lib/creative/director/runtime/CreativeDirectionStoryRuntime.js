import { UsageRuntime } from "@/lib/platform/service-runtime/usage/UsageRuntime";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function parseJson(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const source = text(value).replace(/^\uFEFF/, "");
  if (!source) return null;
  const candidates = [source];
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }
  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(source.slice(firstBrace, lastBrace + 1));
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return null;
}

function directPlan(value = {}) {
  const source = object(value);
  const workflowKind = text(source.workflow_kind || source.workflowKind);
  const scenes = Array.isArray(source.scenes) ? source.scenes : null;
  return workflowKind && scenes ? source : null;
}

function findPlan(value, seen = new Set(), depth = 0) {
  if (!value || depth > 24) return null;
  if (typeof value === "string") {
    const parsed = parseJson(value);
    return parsed ? findPlan(parsed, seen, depth + 1) : null;
  }
  if (typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findPlan(item, seen, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const direct = directPlan(value);
  if (direct) return direct;
  for (const nested of Object.values(value)) {
    const found = findPlan(nested, seen, depth + 1);
    if (found) return found;
  }
  return null;
}

export async function recoverStoredCreativeStory({ organization_id, creative_project_id } = {}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");
  const rows = await UsageRuntime.organization(organization_id);
  const candidates = rows.filter((row) => {
    const metadata = object(row.metadata);
    return text(row.status).toUpperCase() === "SUCCESS" &&
      text(row.category).toUpperCase() === "CREATIVE_DIRECTION" &&
      text(metadata.operation).toUpperCase() === "MASTER_PLAN_V3" &&
      text(metadata.creative_project_id) === text(creative_project_id) &&
      metadata.result;
  });
  for (const usage of candidates) {
    const plan = findPlan(usage.metadata.result);
    if (plan) return { usage_id: usage.id, provider: usage.provider || null, plan };
  }
  throw new Error(`CREATIVE_STORY_NOT_RECOVERABLE:${creative_project_id}`);
}

function valueLine(label, value) {
  const rendered = typeof value === "string" ? value : JSON.stringify(value || null, null, 2);
  return text(rendered) ? `**${label}:** ${rendered}` : null;
}

export function creativeStoryMarkdown({ recovered, project_name = "Full-song music video" } = {}) {
  const plan = object(recovered?.plan);
  const concept = object(plan.concept);
  const story = object(plan.story);
  const scenes = list(plan.scenes);
  const output = [
    `# ${text(concept.title) || text(project_name)}`,
    "",
    `Stored master-plan usage: \`${text(recovered?.usage_id)}\``,
    recovered?.provider ? `Provider: ${text(recovered.provider)}` : null,
    "",
    "## Core concept",
    "",
    valueLine("Hook", concept.hook),
    valueLine("Message", concept.message),
    valueLine("Narrative", concept.narrative),
    valueLine("Emotional promise", concept.emotional_promise),
    "",
    "## Story arc",
    "",
    valueLine("Hook", story.hook),
    valueLine("Audience tension", story.audience_tension),
    valueLine("Escalation", story.escalation),
    valueLine("Turn", story.turn),
    valueLine("Resolution", story.resolution),
    valueLine("Emotional arc", story.emotional_arc),
    "",
    "## Scene-by-scene story",
    "",
  ].filter(Boolean);
  scenes.forEach((scene, index) => {
    output.push(
      `### ${index + 1}. ${text(scene.title) || `Scene ${index + 1}`}`,
      "",
      valueLine("Duration", `${Number(scene.duration_seconds || 0).toFixed(3)} seconds`),
      valueLine("Story purpose", scene.objective),
      valueLine("Audience emotion", scene.emotion),
      valueLine("Before", scene.story_state_before),
      valueLine("Change", scene.state_change),
      valueLine("After", scene.story_state_after),
      valueLine("Transition", scene.transition_logic),
      "",
    );
  });
  return output.filter(Boolean).join("\n");
}

export const CreativeDirectionStoryRuntime = {
  recover: recoverStoredCreativeStory,
  markdown: creativeStoryMarkdown,
};
