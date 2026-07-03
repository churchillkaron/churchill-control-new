export const DELIVERABLE_TYPES = {

  VIDEO: "VIDEO",

  IMAGE: "IMAGE",

  DOCUMENT: "DOCUMENT",

  MENU: "MENU",

  WEBSITE: "WEBSITE",

  PRESENTATION: "PRESENTATION",

  SOCIAL_POST: "SOCIAL_POST",

  STORY: "STORY",

  REEL: "REEL",

  BANNER: "BANNER",

  POSTER: "POSTER",

};

export const DELIVERABLE_STATUS = {

  DRAFT: "DRAFT",

  PLANNING: "PLANNING",

  PRODUCTION: "PRODUCTION",

  RENDERING: "RENDERING",

  REVIEW: "REVIEW",

  APPROVED: "APPROVED",

  PUBLISHED: "PUBLISHED",

  ARCHIVED: "ARCHIVED",

};

export function createCreativeDeliverable(
  data = {}
) {

  const now =
    new Date().toISOString();

  return {

    id:
      crypto.randomUUID(),

    project_id:
      data.project_id,

    organization_id:
      data.organization_id,

    type:
      data.type,

    name:
      data.name ?? "",

    description:
      data.description ?? "",

    status:
      DELIVERABLE_STATUS.DRAFT,

    version: 1,

    assets: [],

    outputs: [],

    metadata: {},

    created_at: now,

    updated_at: now,

  };

}
