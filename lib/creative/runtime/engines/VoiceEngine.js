import {
  CreativePostProductionRuntime,
} from "@/lib/creative/post-production/runtime/CreativePostProductionRuntime";

export const VoiceEngine = {
  id: "voice",

  async execute(context = {}) {
    const packageDocument = await CreativePostProductionRuntime.build({
      organization_id: context.organization_id,
      creative_project_id: context.creative_project_id,
    });

    return {
      ...context,
      dialogue: packageDocument.audio.stems.dialogue,
      voiceover: packageDocument.audio.stems.voiceover,
      mix_rules: packageDocument.audio.mix_rules,
      status: packageDocument.status,
    };
  },
};
