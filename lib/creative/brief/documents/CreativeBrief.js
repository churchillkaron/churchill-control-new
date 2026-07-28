import crypto from "node:crypto";

export const CREATIVE_BRIEF_STATUS = {
  DRAFT: "DRAFT",
  APPROVED: "APPROVED",
  IN_PRODUCTION: "IN_PRODUCTION",
  COMPLETED: "COMPLETED",
};

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value, fallback = []) {
  return Array.isArray(value)
    ? value.filter((entry) => entry !== null && entry !== undefined && entry !== "")
    : fallback;
}

function duration(value, fallback = 30) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function createCreativeBrief(data = {}) {
  const now = new Date().toISOString();
  const title = String(data.title ?? "").trim();

  if (!data.organization_id) throw new Error("organization_id required");
  if (!title) throw new Error("Creative brief title required");

  return {
    id: data.id || crypto.randomUUID(),
    organization_id: data.organization_id,
    creative_project_id: data.creative_project_id ?? null,
    creative_mission_id: data.creative_mission_id ?? null,
    status: CREATIVE_BRIEF_STATUS.DRAFT,
    title,
    business_goal: String(data.business_goal ?? ""),
    creative_objective: String(
      data.creative_objective ?? data.campaign_goal ?? "",
    ),
    desired_outcome: String(data.desired_outcome ?? ""),
    communication_goal: String(data.communication_goal ?? ""),
    target_audience: object(data.target_audience),
    context: object(data.context),
    products: list(data.products),
    markets: list(data.markets),
    languages: list(data.languages, ["en"]),
    channels: list(data.channels),
    duration_seconds: duration(data.duration_seconds),
    tone: String(data.tone ?? "professional"),
    emotion: String(data.emotion ?? "trust"),
    requested_action: String(
      data.requested_action ?? data.call_to_action ?? "",
    ),
    budget: {
      ...object(data.budget),
      max_cost: Number.isFinite(Number(data.budget?.max_cost))
        ? Number(data.budget.max_cost)
        : 0,
      estimated_cost: Number.isFinite(Number(data.budget?.estimated_cost))
        ? Number(data.budget.estimated_cost)
        : 0,
      approved: data.budget?.approved === true,
    },
    production: {
      quality: data.production?.quality ?? "balanced",
      reuse_assets: data.production?.reuse_assets !== false,
      draft_first: data.production?.draft_first !== false,
      ...object(data.production),
    },
    metadata: object(data.metadata),
    created_by: data.created_by ?? null,
    created_at: data.created_at || now,
    updated_at: now,
  };
}
