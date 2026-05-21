import buildOwnerResponse from "@/lib/intelligence/chat/buildOwnerResponse";

export default async function buildVoiceResponse({
  tenant_id,
  transcript,
}) {

  try {

    const ai =
      await buildOwnerResponse({
        tenant_id,
        question:
          transcript,
      });

    return {
      success: true,
      transcript,
      response:
        ai.answer,
      voice:
        {
          enabled: true,
          model:
            "churchill-voice-v1",
        },
      generated_at:
        new Date().toISOString(),
    };

  } catch (error) {

    return {
      success: false,
      error:
        error.message,
    };
  }
}
