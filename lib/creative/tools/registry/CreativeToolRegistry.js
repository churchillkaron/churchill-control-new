import {
  creativeMediaBinaryReadiness,
} from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

export const CREATIVE_TOOL_RUNTIME = Object.freeze({
  LOCAL: "LOCAL",
  SANDBOX: "SANDBOX",
  SERVICE_RUNTIME: "SERVICE_RUNTIME",
});

export const CREATIVE_TOOL_COST_CLASS = Object.freeze({
  ZERO: "ZERO",
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  PROVIDER_METERED: "PROVIDER_METERED",
});

export const CREATIVE_TOOL_QUALITY_TIER = Object.freeze({
  UTILITY: "UTILITY",
  PRODUCTION: "PRODUCTION",
  PREMIUM: "PREMIUM",
  PROVIDER_DEPENDENT: "PROVIDER_DEPENDENT",
});

export const CREATIVE_TOOL_CAPABILITIES = Object.freeze({
  MEDIA_INSPECT: "creative.media.inspect",
  MEDIA_TRANSCODE: "creative.media.transcode",
  MEDIA_EDIT: "creative.media.edit",
  MEDIA_MUX: "creative.media.mux",
  MEDIA_PROXY: "creative.media.proxy",
  COLOR_GRADE: "creative.video.color-grade",
  LUT_APPLY: "creative.video.lut.apply",
  SCENE_DETECT: "creative.video.scene-detect",
  FRAME_EXTRACT: "creative.video.frame.extract",
  SUBTITLE_RENDER: "creative.video.subtitle.render",
  CAPTION_BURN: "creative.video.caption.burn",
  AUDIO_MIX: "creative.audio.mix",
  AUDIO_ANALYSE: "creative.audio.analyse",
  AUDIO_NORMALIZE: "creative.audio.normalize",
  AUDIO_WAVEFORM: "creative.audio.waveform",
  AUDIO_DUCK: "creative.audio.duck",
  IMAGE_FINISH: "creative.image.finish",
  IMAGE_RESIZE: "creative.image.resize",
  IMAGE_COMPOSITE: "creative.image.composite",
  MOTION_COMPOSE: "creative.motion.compose",
  TITLE_ANIMATE: "creative.title.animate",
  LOWER_THIRD_RENDER: "creative.lower-third.render",
  SPATIAL_PRODUCT_TWIN: "creative.spatial-product-twin.compose",
  UI_CAPTURE: "creative.ui.capture",
  BROWSER_RECORD: "creative.browser.record",
  HTML_RENDER: "creative.html.render",
  SVG_RENDER: "creative.svg.render",
  VECTOR_RENDER: "creative.vector.render",
  THREE_D_RENDER: "creative.3d.render",
  CAMERA_TRACK: "creative.camera.track",
  OBJECT_TRACK: "creative.object.track",
  OPTICAL_FLOW: "creative.optical-flow.compute",
  SEGMENTATION: "creative.segmentation.execute",
  MOTION_ANALYSE: "creative.motion.analyse",
  BACKGROUND_REMOVE: "creative.background.remove",
  UPSCALE: "creative.media.upscale",
  VIDEO_GENERATE: "ai.video.generate",
  IMAGE_TO_VIDEO: "ai.video.image_to_video",
  FIRST_LAST_FRAME_TO_VIDEO: "ai.video.first_last_frame_to_video",
  VIDEO_TO_VIDEO: "ai.video.video_to_video",
  VIDEO_EDIT: "ai.video.edit",
  VIDEO_INPAINT: "ai.video.inpaint",
  IMAGE_GENERATE: "ai.image.generate",
  IMAGE_EDIT: "ai.image.edit",
  IMAGE_INPAINT: "ai.image.inpaint",
  IMAGE_OUTPAINT: "ai.image.outpaint",
  VOICE_GENERATE: "ai.text.to.speech",
  SPEECH_TO_TEXT: "ai.speech.to.text",
  MUSIC_GENERATE: "ai.music.generate",
  SOUND_EFFECT_GENERATE: "ai.sfx.generate",
  LIP_SYNC: "ai.video.lipsync",
  PERCEPTUAL_REVIEW: "ai.image.analyze",
  CODE_GENERATE: "ai.code.generate",
  CODE_EDIT: "ai.code.edit",
  CODE_REFACTOR: "ai.code.refactor",
  CODE_REVIEW: "ai.code.review",
  CODE_DEBUG: "ai.code.debug",
  CODE_TEST: "ai.code.test",
  CODE_EXECUTE: "ai.code.execute",
  WEB_BUILD: "ai.web.build",
  WEB_REPAIR: "ai.web.repair",
  APP_BUILD: "ai.app.build",
  INTEGRATION_BUILD: "ai.integration.build",
});

const TOOL_DEFINITIONS = Object.freeze([
  {
    id: "ffmpeg",
    label: "FFmpeg",
    runtime: CREATIVE_TOOL_RUNTIME.LOCAL,
    availability: "RUNTIME_DISCOVERED",
    deterministic: true,
    quality_tier: CREATIVE_TOOL_QUALITY_TIER.PRODUCTION,
    cost_class: CREATIVE_TOOL_COST_CLASS.ZERO,
    human_approval_required: false,
    fallback_policy: "FAIL_CLOSED_IF_BINARY_MISSING",
    capabilities: [
      CREATIVE_TOOL_CAPABILITIES.MEDIA_TRANSCODE,
      CREATIVE_TOOL_CAPABILITIES.MEDIA_EDIT,
      CREATIVE_TOOL_CAPABILITIES.MEDIA_MUX,
      CREATIVE_TOOL_CAPABILITIES.MEDIA_PROXY,
      CREATIVE_TOOL_CAPABILITIES.COLOR_GRADE,
      CREATIVE_TOOL_CAPABILITIES.LUT_APPLY,
      CREATIVE_TOOL_CAPABILITIES.SCENE_DETECT,
      CREATIVE_TOOL_CAPABILITIES.FRAME_EXTRACT,
      CREATIVE_TOOL_CAPABILITIES.SUBTITLE_RENDER,
      CREATIVE_TOOL_CAPABILITIES.CAPTION_BURN,
      CREATIVE_TOOL_CAPABILITIES.AUDIO_MIX,
      CREATIVE_TOOL_CAPABILITIES.AUDIO_ANALYSE,
      CREATIVE_TOOL_CAPABILITIES.AUDIO_NORMALIZE,
      CREATIVE_TOOL_CAPABILITIES.AUDIO_WAVEFORM,
      CREATIVE_TOOL_CAPABILITIES.AUDIO_DUCK,
    ],
  },
  {
    id: "ffprobe",
    label: "FFprobe",
    runtime: CREATIVE_TOOL_RUNTIME.LOCAL,
    availability: "RUNTIME_DISCOVERED",
    deterministic: true,
    quality_tier: CREATIVE_TOOL_QUALITY_TIER.UTILITY,
    cost_class: CREATIVE_TOOL_COST_CLASS.ZERO,
    human_approval_required: false,
    fallback_policy: "FAIL_CLOSED_IF_BINARY_MISSING",
    capabilities: [CREATIVE_TOOL_CAPABILITIES.MEDIA_INSPECT],
  },
  {
    id: "sharp",
    label: "Sharp / libvips",
    runtime: CREATIVE_TOOL_RUNTIME.LOCAL,
    availability: "INSTALLED",
    deterministic: true,
    quality_tier: CREATIVE_TOOL_QUALITY_TIER.PRODUCTION,
    cost_class: CREATIVE_TOOL_COST_CLASS.ZERO,
    human_approval_required: false,
    fallback_policy: "NO_IMAGE_MAGICK_FALLBACK_UNLESS_EXPLICITLY_SELECTED",
    capabilities: [
      CREATIVE_TOOL_CAPABILITIES.IMAGE_FINISH,
      CREATIVE_TOOL_CAPABILITIES.IMAGE_RESIZE,
      CREATIVE_TOOL_CAPABILITIES.IMAGE_COMPOSITE,
    ],
  },
  {
    id: "remotion",
    label: "Remotion",
    runtime: CREATIVE_TOOL_RUNTIME.SANDBOX,
    availability: "ON_DEMAND",
    deterministic: true,
    quality_tier: CREATIVE_TOOL_QUALITY_TIER.PREMIUM,
    cost_class: CREATIVE_TOOL_COST_CLASS.LOW,
    human_approval_required: false,
    fallback_policy: "FALLBACK_TO_FFMPEG_ONLY_FOR_SIMPLE_COMPOSITION",
    capabilities: [
      CREATIVE_TOOL_CAPABILITIES.MOTION_COMPOSE,
      CREATIVE_TOOL_CAPABILITIES.TITLE_ANIMATE,
      CREATIVE_TOOL_CAPABILITIES.LOWER_THIRD_RENDER,
      CREATIVE_TOOL_CAPABILITIES.SPATIAL_PRODUCT_TWIN,
    ],
  },
  {
    id: "chromium-playwright",
    label: "Chromium + Playwright",
    runtime: CREATIVE_TOOL_RUNTIME.SANDBOX,
    availability: "ON_DEMAND",
    deterministic: true,
    quality_tier: CREATIVE_TOOL_QUALITY_TIER.PREMIUM,
    cost_class: CREATIVE_TOOL_COST_CLASS.LOW,
    human_approval_required: false,
    fallback_policy: "NO_FAKE_UI_FALLBACK",
    capabilities: [
      CREATIVE_TOOL_CAPABILITIES.UI_CAPTURE,
      CREATIVE_TOOL_CAPABILITIES.BROWSER_RECORD,
      CREATIVE_TOOL_CAPABILITIES.HTML_RENDER,
      CREATIVE_TOOL_CAPABILITIES.SVG_RENDER,
    ],
  },
  {
    id: "blender",
    label: "Blender",
    runtime: CREATIVE_TOOL_RUNTIME.SANDBOX,
    availability: "ON_DEMAND",
    deterministic: true,
    quality_tier: CREATIVE_TOOL_QUALITY_TIER.PREMIUM,
    cost_class: CREATIVE_TOOL_COST_CLASS.MEDIUM,
    human_approval_required: false,
    fallback_policy: "NO_3D_FALLBACK_IF_DIRECTION_REQUIRES_3D",
    capabilities: [CREATIVE_TOOL_CAPABILITIES.THREE_D_RENDER],
  },
  {
    id: "opencv",
    label: "OpenCV",
    runtime: CREATIVE_TOOL_RUNTIME.SANDBOX,
    availability: "ON_DEMAND",
    deterministic: true,
    quality_tier: CREATIVE_TOOL_QUALITY_TIER.PRODUCTION,
    cost_class: CREATIVE_TOOL_COST_CLASS.LOW,
    human_approval_required: false,
    fallback_policy: "FAIL_CLOSED_FOR_TRACKING_OR_SEGMENTATION_GATES",
    capabilities: [
      CREATIVE_TOOL_CAPABILITIES.CAMERA_TRACK,
      CREATIVE_TOOL_CAPABILITIES.OBJECT_TRACK,
      CREATIVE_TOOL_CAPABILITIES.OPTICAL_FLOW,
      CREATIVE_TOOL_CAPABILITIES.SEGMENTATION,
      CREATIVE_TOOL_CAPABILITIES.MOTION_ANALYSE,
    ],
  },
  {
    id: "imagemagick",
    label: "ImageMagick",
    runtime: CREATIVE_TOOL_RUNTIME.SANDBOX,
    availability: "ON_DEMAND",
    deterministic: true,
    quality_tier: CREATIVE_TOOL_QUALITY_TIER.PRODUCTION,
    cost_class: CREATIVE_TOOL_COST_CLASS.LOW,
    human_approval_required: false,
    fallback_policy: "PREFER_SHARP_WHERE_CAPABILITY_OVERLAPS",
    capabilities: [
      CREATIVE_TOOL_CAPABILITIES.IMAGE_FINISH,
      CREATIVE_TOOL_CAPABILITIES.VECTOR_RENDER,
    ],
  },
  {
    id: "service-runtime",
    label: "Avantiqo Service Runtime",
    runtime: CREATIVE_TOOL_RUNTIME.SERVICE_RUNTIME,
    availability: "GOVERNED",
    deterministic: false,
    quality_tier: CREATIVE_TOOL_QUALITY_TIER.PROVIDER_DEPENDENT,
    cost_class: CREATIVE_TOOL_COST_CLASS.PROVIDER_METERED,
    human_approval_required: true,
    fallback_policy: "PROVIDER_RESOLVER_AND_ORGANIZATION_POLICY_ONLY",
    capabilities: [
      CREATIVE_TOOL_CAPABILITIES.VIDEO_GENERATE,
      CREATIVE_TOOL_CAPABILITIES.IMAGE_TO_VIDEO,
      CREATIVE_TOOL_CAPABILITIES.FIRST_LAST_FRAME_TO_VIDEO,
      CREATIVE_TOOL_CAPABILITIES.VIDEO_TO_VIDEO,
      CREATIVE_TOOL_CAPABILITIES.VIDEO_EDIT,
      CREATIVE_TOOL_CAPABILITIES.VIDEO_INPAINT,
      CREATIVE_TOOL_CAPABILITIES.IMAGE_GENERATE,
      CREATIVE_TOOL_CAPABILITIES.IMAGE_EDIT,
      CREATIVE_TOOL_CAPABILITIES.IMAGE_INPAINT,
      CREATIVE_TOOL_CAPABILITIES.IMAGE_OUTPAINT,
      CREATIVE_TOOL_CAPABILITIES.VOICE_GENERATE,
      CREATIVE_TOOL_CAPABILITIES.SPEECH_TO_TEXT,
      CREATIVE_TOOL_CAPABILITIES.MUSIC_GENERATE,
      CREATIVE_TOOL_CAPABILITIES.SOUND_EFFECT_GENERATE,
      CREATIVE_TOOL_CAPABILITIES.LIP_SYNC,
      CREATIVE_TOOL_CAPABILITIES.BACKGROUND_REMOVE,
      CREATIVE_TOOL_CAPABILITIES.UPSCALE,
      CREATIVE_TOOL_CAPABILITIES.PERCEPTUAL_REVIEW,
      CREATIVE_TOOL_CAPABILITIES.CODE_GENERATE,
      CREATIVE_TOOL_CAPABILITIES.CODE_EDIT,
      CREATIVE_TOOL_CAPABILITIES.CODE_REFACTOR,
      CREATIVE_TOOL_CAPABILITIES.CODE_REVIEW,
      CREATIVE_TOOL_CAPABILITIES.CODE_DEBUG,
      CREATIVE_TOOL_CAPABILITIES.CODE_TEST,
      CREATIVE_TOOL_CAPABILITIES.CODE_EXECUTE,
      CREATIVE_TOOL_CAPABILITIES.WEB_BUILD,
      CREATIVE_TOOL_CAPABILITIES.WEB_REPAIR,
      CREATIVE_TOOL_CAPABILITIES.APP_BUILD,
      CREATIVE_TOOL_CAPABILITIES.INTEGRATION_BUILD,
    ],
  },
]);

function toolReadiness(tool) {
  if (tool.id !== "ffmpeg" && tool.id !== "ffprobe") {
    return { ...tool };
  }

  const readiness = creativeMediaBinaryReadiness();
  if (tool.id === "ffmpeg") {
    return {
      ...tool,
      available: readiness.ffmpeg_configured,
      source: readiness.ffmpeg_source,
    };
  }

  return {
    ...tool,
    available: readiness.ffprobe_configured,
    source: readiness.ffprobe_source,
  };
}

export function listCreativeTools() {
  return TOOL_DEFINITIONS.map(toolReadiness);
}

export function getCreativeToolsForCapability(capability) {
  return listCreativeTools().filter((tool) =>
    tool.capabilities.includes(capability),
  );
}

export function resolveCreativeTool(capability, { runtime = null } = {}) {
  const candidates = getCreativeToolsForCapability(capability)
    .filter((tool) => !runtime || tool.runtime === runtime)
    .filter((tool) => tool.available !== false)
    .sort((left, right) => {
      const leftRank = left.runtime === CREATIVE_TOOL_RUNTIME.LOCAL
        ? 0
        : left.runtime === CREATIVE_TOOL_RUNTIME.SANDBOX
          ? 1
          : 2;
      const rightRank = right.runtime === CREATIVE_TOOL_RUNTIME.LOCAL
        ? 0
        : right.runtime === CREATIVE_TOOL_RUNTIME.SANDBOX
          ? 1
          : 2;
      return leftRank - rightRank;
    });

  return candidates[0] || null;
}

export const CreativeToolRegistry = Object.freeze({
  runtimes: CREATIVE_TOOL_RUNTIME,
  costClasses: CREATIVE_TOOL_COST_CLASS,
  qualityTiers: CREATIVE_TOOL_QUALITY_TIER,
  capabilities: CREATIVE_TOOL_CAPABILITIES,
  list: listCreativeTools,
  forCapability: getCreativeToolsForCapability,
  resolve: resolveCreativeTool,
});
