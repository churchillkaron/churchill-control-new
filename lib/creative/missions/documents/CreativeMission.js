export function createCreativeMissionDocument(input = {}) {

  const now =
    new Date().toISOString();

  return {

    id:
      input.id ||
      crypto.randomUUID(),

    organization_id:
      input.organization_id,

    campaign_id:
      input.campaign_id || null,

    title:
      input.title ||
      input.business_goal ||
      "",

    business_goal:
      input.business_goal || "",

    objective:
      input.objective || "",

    status:
      input.status || "draft",

    approval_state:
      input.approval_state ||
      "not_required",

    audience:
      input.audience || {},

    channels:
      input.channels || [],

    metadata:
      input.metadata || {},

    learning_summary:
      input.learning_summary || {},

    started_at:
      input.started_at || null,

    completed_at:
      input.completed_at || null,

    created_at:
      input.created_at || now,

    updated_at:
      now,

  };

}
