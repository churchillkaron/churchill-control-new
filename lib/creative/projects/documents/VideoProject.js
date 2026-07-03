export const VIDEO_PROJECT_STATUS = {
  DRAFT: "DRAFT",
  RESEARCH: "RESEARCH",
  DIRECTION: "DIRECTION",
  PRODUCTION: "PRODUCTION",
  RENDERING: "RENDERING",
  QUALITY: "QUALITY",
  PUBLISHED: "PUBLISHED",
  ARCHIVED: "ARCHIVED",
};

export function createVideoProject(data = {}) {

  const now = new Date().toISOString();

  return {

    id:
      crypto.randomUUID(),

    organization_id:
      data.organization_id,

    version: 1,

    status:
      VIDEO_PROJECT_STATUS.DRAFT,

    name:
      data.name ?? "Untitled Video",

    objective:
      data.objective ?? "",

    business:
      data.business ?? {},

    brand:
      data.brand ?? {},

    audience:
      data.audience ?? {},

    platforms:
      data.platforms ?? ["facebook"],

    languages:
      data.languages ?? ["en"],

    duration_seconds:
      Number(
        data.duration_seconds ?? 30
      ),

    budget_mode:
      data.budget_mode ?? "BALANCED",

    metadata:
      data.metadata ?? {},

    created_by:
      data.created_by ?? null,

    archived: false,

    created_at: now,

    updated_at: now,

  };

}
