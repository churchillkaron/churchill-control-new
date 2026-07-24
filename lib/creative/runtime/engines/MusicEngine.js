import {
  CreativePostProductionRuntime,
} from "@/lib/creative/post-production/runtime/CreativePostProductionRuntime";

export const MusicEngine = {
  id: "music",

  async execute(context = {}) {
    const packageDocument = await CreativePostProductionRuntime.build({
      organization_id: context.organization_id,
      creative_project_id: context.creative_project_id,
    });

    return {
      ...context,
      music: packageDocument.audio.stems.music,
      sound_effects: packageDocument.audio.stems.sfx,
      foley: packageDocument.audio.stems.foley,
      ambience: packageDocument.audio.stems.ambience,
      mix_rules: packageDocument.audio.mix_rules,
      status: packageDocument.status,
    };
  },
};
