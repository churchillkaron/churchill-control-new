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

const ALLOWED = {
  DRAFT: ["RESEARCH", "ARCHIVED"],
  RESEARCH: ["DIRECTION", "DRAFT"],
  DIRECTION: ["PRODUCTION", "RESEARCH"],
  PRODUCTION: ["RENDERING", "DIRECTION"],
  RENDERING: ["QUALITY", "PRODUCTION"],
  QUALITY: ["RENDERING", "PUBLISHED"],
  PUBLISHED: ["ARCHIVED"],
  ARCHIVED: [],
};

export function canTransition(from, to) {
  return (ALLOWED[from] || []).includes(to);
}

export function transitionProject(project, nextStatus) {
  if (!canTransition(project.status, nextStatus)) {
    throw new Error(
      `Invalid transition ${project.status} -> ${nextStatus}`
    );
  }

  return {
    ...project,
    status: nextStatus,
    updated_at: new Date().toISOString(),
  };
}
