export const PLATFORM_AI_SERVICES = [
  {
    id: "ai.reasoning.execute",
    name: "AI Reasoning",
    category: "ai",
    requires: ["REASONING"],
  },
  {
    id: "ai.text.generate",
    name: "AI Text Generation",
    category: "ai",
    requires: ["GENERATE_TEXT"],
  },

  // Avantiqo Image production family.
  {
    id: "ai.image.generate",
    name: "AI Image Generation",
    category: "ai",
    requires: ["GENERATE_IMAGE"],
  },
  {
    id: "ai.image.edit",
    name: "AI Image Edit",
    category: "ai",
    requires: ["EDIT_IMAGE"],
  },
  {
    id: "ai.image.inpaint",
    name: "AI Image Inpaint",
    category: "ai",
    requires: ["INPAINT_IMAGE"],
  },
  {
    id: "ai.image.outpaint",
    name: "AI Image Outpaint",
    category: "ai",
    requires: ["OUTPAINT_IMAGE"],
  },
  {
    id: "ai.image.analyze",
    name: "AI Image Analysis",
    category: "ai",
    requires: ["IMAGE_ANALYSIS"],
  },
  {
    id: "ai.image.upscale",
    name: "Image Upscale",
    category: "ai",
    requires: ["UPSCALE_IMAGE"],
  },

  // Avantiqo Cinema production family.
  {
    id: "ai.video.generate",
    name: "AI Video Generation",
    category: "ai",
    requires: ["GENERATE_VIDEO"],
  },
  {
    id: "ai.video.image_to_video",
    name: "Image To Video",
    category: "ai",
    requires: ["IMAGE_TO_VIDEO"],
  },
  {
    id: "ai.video.video_to_video",
    name: "Video To Video",
    category: "ai",
    requires: ["VIDEO_TO_VIDEO"],
  },
  {
    id: "ai.video.keyframe_to_video",
    name: "Keyframe To Video",
    category: "ai",
    requires: ["KEYFRAME_TO_VIDEO"],
  },
  {
    id: "ai.video.edit",
    name: "AI Video Edit",
    category: "ai",
    requires: ["EDIT_VIDEO"],
  },
  {
    id: "ai.video.inpaint",
    name: "AI Video Inpaint",
    category: "ai",
    requires: ["INPAINT_VIDEO"],
  },
  {
    id: "ai.video.outpaint",
    name: "AI Video Outpaint",
    category: "ai",
    requires: ["OUTPAINT_VIDEO"],
  },
  {
    id: "ai.video.extend",
    name: "AI Video Extend",
    category: "ai",
    requires: ["EXTEND_VIDEO"],
  },
  {
    id: "ai.video.motion_transfer",
    name: "Video Motion Transfer",
    category: "ai",
    requires: ["TRANSFER_VIDEO_MOTION"],
  },
  {
    id: "ai.video.relight",
    name: "Video Relight",
    category: "ai",
    requires: ["RELIGHT_VIDEO"],
  },
  {
    id: "ai.video.restore",
    name: "Video Restore",
    category: "ai",
    requires: ["RESTORE_VIDEO"],
  },
  {
    id: "ai.video.upscale",
    name: "Video Upscale",
    category: "ai",
    requires: ["UPSCALE_VIDEO"],
  },
  {
    id: "ai.video.interpolate",
    name: "Video Frame Interpolation",
    category: "ai",
    requires: ["INTERPOLATE_VIDEO"],
  },
  {
    id: "ai.video.lipsync",
    name: "Lip Sync",
    category: "ai",
    requires: ["LIPSYNC"],
  },
  {
    id: "ai.video.analyze",
    name: "Video Analysis",
    category: "ai",
    requires: ["ANALYZE_VIDEO"],
  },

  // Avantiqo Audio production family.
  {
    id: "ai.audio.generate",
    name: "Audio Generation",
    category: "ai",
    requires: ["GENERATE_AUDIO"],
  },
  {
    id: "ai.music.generate",
    name: "Music Generation",
    category: "ai",
    requires: ["GENERATE_MUSIC"],
  },
  {
    id: "ai.sfx.generate",
    name: "Sound Effects Generation",
    category: "ai",
    requires: ["GENERATE_SFX"],
  },
  {
    id: "ai.audio.edit",
    name: "Audio Edit",
    category: "ai",
    requires: ["EDIT_AUDIO"],
  },
  {
    id: "ai.audio.extend",
    name: "Audio Extend",
    category: "ai",
    requires: ["EXTEND_AUDIO"],
  },
  {
    id: "ai.audio.remix",
    name: "Audio Remix",
    category: "ai",
    requires: ["REMIX_AUDIO"],
  },
  {
    id: "ai.audio.stems",
    name: "Audio Stem Separation",
    category: "ai",
    requires: ["SEPARATE_AUDIO_STEMS"],
  },
  {
    id: "ai.audio.mix",
    name: "Audio Mix",
    category: "ai",
    requires: ["MIX_AUDIO"],
  },
  {
    id: "ai.audio.master",
    name: "Audio Mastering",
    category: "ai",
    requires: ["MASTER_AUDIO"],
  },

  // Governed voice and speech family.
  {
    id: "ai.voice.generate",
    name: "AI Voice Generation",
    category: "ai",
    requires: ["GENERATE_VOICE"],
  },
  {
    id: "ai.voice.dub",
    name: "AI Voice Dubbing",
    category: "ai",
    requires: ["DUB_VOICE"],
  },
  {
    id: "ai.voice.repair",
    name: "AI Voice Repair",
    category: "ai",
    requires: ["REPAIR_VOICE"],
  },
  {
    id: "ai.speech.to.text",
    name: "Speech To Text",
    category: "ai",
    requires: ["SPEECH_TO_TEXT"],
    execution_capabilities: [
      "ai.speech.to.text",
      "ai.speech.to.text.realtime",
    ],
  },
  {
    id: "ai.text.to.speech",
    name: "Text To Speech",
    category: "ai",
    requires: ["TEXT_TO_SPEECH"],
  },

  // Avantiqo Code / Web / App production family.
  {
    id: "ai.code.generate",
    name: "Code Generation",
    category: "ai",
    requires: ["GENERATE_CODE"],
  },
  {
    id: "ai.code.edit",
    name: "Code Edit",
    category: "ai",
    requires: ["EDIT_CODE"],
  },
  {
    id: "ai.code.refactor",
    name: "Code Refactor",
    category: "ai",
    requires: ["REFACTOR_CODE"],
  },
  {
    id: "ai.code.review",
    name: "Code Review",
    category: "ai",
    requires: ["REVIEW_CODE"],
  },
  {
    id: "ai.code.debug",
    name: "Code Debug",
    category: "ai",
    requires: ["DEBUG_CODE"],
  },
  {
    id: "ai.code.test",
    name: "Code Test",
    category: "ai",
    requires: ["TEST_CODE"],
  },
  {
    id: "ai.code.execute",
    name: "Code Execute",
    category: "ai",
    requires: ["EXECUTE_CODE"],
  },
  {
    id: "ai.web.build",
    name: "Web Build",
    category: "ai",
    requires: ["BUILD_WEB"],
  },
  {
    id: "ai.web.repair",
    name: "Web Repair",
    category: "ai",
    requires: ["REPAIR_WEB"],
  },
  {
    id: "ai.app.build",
    name: "App Build",
    category: "ai",
    requires: ["BUILD_APP"],
  },
  {
    id: "ai.integration.build",
    name: "Integration Build",
    category: "ai",
    requires: ["BUILD_INTEGRATION"],
  },

  {
    id: "ai.translate",
    name: "Translation",
    category: "ai",
    requires: ["TRANSLATE"],
  },
  {
    id: "document.ocr",
    name: "Document OCR",
    category: "document",
    requires: ["OCR"],
  },
  {
    id: "ai.embeddings.create",
    name: "Embeddings",
    category: "ai",
    requires: ["EMBEDDINGS"],
  },
  {
    id: "ai.moderation.execute",
    name: "Moderation",
    category: "ai",
    requires: ["MODERATION"],
  },
];

export function getPlatformAIService(id) {
  return PLATFORM_AI_SERVICES.find(service => service.id === id) || null;
}
