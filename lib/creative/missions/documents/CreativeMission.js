export function createCreativeMissionDocument(input = {}) {
  const now = new Date().toISOString();

  return {
    id: input.id || crypto.randomUUID(),

    organization_id: input.organization_id,
    workspace_id: input.workspace_id || null,

    mission_type: input.mission_type || "campaign",
    business_goal: input.business_goal || "",
    objective: input.objective || "",

    status: input.status || "draft",
    priority: input.priority || "normal",

    brand_id: input.brand_id || null,
    creative_project_id: input.creative_project_id || null,

    budget: Number(input.budget || 0),
    currency: input.currency || "USD",

    deadline: input.deadline || null,
    owner_id: input.owner_id || null,

    approval_state: input.approval_state || "not_required",

    audience: input.audience || {},
    channels: input.channels || [],
    languages: input.languages || ["en"],

    roi_target: input.roi_target || null,

    estimated_cost: Number(input.estimated_cost || 0),
    actual_cost: Number(input.actual_cost || 0),
    estimated_duration: input.estimated_duration || null,

    automation_policy:
      input.automation_policy || {
        mode: "director_controlled",
        require_approval_before_publish: true,
        allow_provider_selection: true,
        allow_asset_reuse: true,
        allow_auto_retry: true,
      },

    learning_summary: input.learning_summary || null,

    started_at: input.started_at || null,
    completed_at: input.completed_at || null,

    metadata: input.metadata || {},

    created_at: input.created_at || now,
    updated_at: now,
  };
}
