import crypto from "crypto";

export function createCreativeTimeline(data = {}) {

  return {

    id:
      crypto.randomUUID(),

    organization_id:
      data.organization_id,

    creative_project_id:
      data.creative_project_id,

    title:
      data.title || "Main Timeline",

    duration_seconds:
      data.duration_seconds || 0,

    tracks:
      data.tracks || [

        {
          id: crypto.randomUUID(),
          type: "VIDEO",
          clips: [],
        },

        {
          id: crypto.randomUUID(),
          type: "VOICE",
          clips: [],
        },

        {
          id: crypto.randomUUID(),
          type: "MUSIC",
          clips: [],
        },

        {
          id: crypto.randomUUID(),
          type: "SUBTITLE",
          clips: [],
        },

      ],

    created_at:
      new Date().toISOString(),

    updated_at:
      new Date().toISOString(),

  };

}
