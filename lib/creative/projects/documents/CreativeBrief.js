export function createCreativeBrief(data = {}) {

  return {

    project_id:
      data.project_id,

    business: {

      company:
        data.business?.company ?? "",

      industry:
        data.business?.industry ?? "",

      products:
        data.business?.products ?? [],

      services:
        data.business?.services ?? [],

      strengths:
        data.business?.strengths ?? [],

      competitors:
        data.business?.competitors ?? [],

    },

    campaign: {

      objective:
        data.campaign?.objective ?? "",

      call_to_action:
        data.campaign?.call_to_action ?? "",

      offer:
        data.campaign?.offer ?? "",

      platforms:
        data.campaign?.platforms ?? [],

    },

    audience: {

      primary:
        data.audience?.primary ?? "",

      secondary:
        data.audience?.secondary ?? "",

      location:
        data.audience?.location ?? "",

      language:
        data.audience?.language ?? "en",

    },

    brand: {

      tone:
        data.brand?.tone ?? "",

      personality:
        data.brand?.personality ?? "",

      colors:
        data.brand?.colors ?? [],

      fonts:
        data.brand?.fonts ?? [],

      logo:
        data.brand?.logo ?? null,

      restrictions:
        data.brand?.restrictions ?? [],

    },

    production: {

      type:
        data.production?.type ?? "VIDEO",

      duration:
        data.production?.duration ?? 30,

      quality:
        data.production?.quality ?? "HIGH",

      budget:
        data.production?.budget ?? "BALANCED",

    },

    assets: {

      images:
        data.assets?.images ?? [],

      videos:
        data.assets?.videos ?? [],

      documents:
        data.assets?.documents ?? [],

      logos:
        data.assets?.logos ?? [],

      music:
        data.assets?.music ?? [],

    },

    created_at:
      new Date().toISOString(),

  };

}
