import {
  CREATIVE_TOOL_CAPABILITIES,
  CREATIVE_TOOL_RUNTIME,
} from "@/lib/creative/tools/registry/CreativeToolRegistry";
import {
  CreativeToolResolverRuntime,
} from "@/lib/creative/tools/runtime/CreativeToolResolverRuntime";
import {
  CreativeBrowserCaptureRuntime,
} from "@/lib/creative/tools/runtime/CreativeBrowserCaptureRuntime";
import {
  CreativeRemotionRuntime,
} from "@/lib/creative/tools/runtime/CreativeRemotionRuntime";
import {
  CreativeOpenCVRuntime,
} from "@/lib/creative/tools/runtime/CreativeOpenCVRuntime";
import {
  CreativeOpenCVCameraTrackRuntime,
} from "@/lib/creative/tools/runtime/CreativeOpenCVCameraTrackRuntime";
import {
  CreativeBlenderRuntime,
} from "@/lib/creative/tools/runtime/CreativeBlenderRuntime";
import {
  CreativeSpatialProductTwinRuntime,
} from "@/lib/creative/tools/runtime/CreativeSpatialProductTwinRuntimeV5";

const CONTRACT = "CREATIVE_TOOL_EXECUTION_RUNTIME_V7";

function text(value) {
  return String(value ?? "").trim();
}

function assertScope({ organization_id, creative_project_id } = {}) {
  if (!text(organization_id) || !text(creative_project_id)) {
    throw new Error("CREATIVE_TOOL_EXECUTION_SCOPE_REQUIRED");
  }
}

function publicResolution(resolution) {
  return {
    capability: resolution.capability,
    selected: resolution.selected,
    candidates: resolution.candidates,
  };
}

async function executeSandboxCapability({
  organization_id,
  selected_tool_id,
  capability,
  project,
  input,
}) {
  if (selected_tool_id === "chromium-playwright") {
    if (
      capability === CREATIVE_TOOL_CAPABILITIES.UI_CAPTURE ||
      capability === CREATIVE_TOOL_CAPABILITIES.HTML_RENDER ||
      capability === CREATIVE_TOOL_CAPABILITIES.SVG_RENDER
    ) {
      return CreativeBrowserCaptureRuntime.captureFrame({ project, ...input });
    }
    if (capability === CREATIVE_TOOL_CAPABILITIES.BROWSER_RECORD) {
      return CreativeBrowserCaptureRuntime.record({ project, ...input });
    }
  }

  if (selected_tool_id === "remotion") {
    if (capability === CREATIVE_TOOL_CAPABILITIES.SPATIAL_PRODUCT_TWIN) {
      return CreativeSpatialProductTwinRuntime.render({ organization_id, project, ...input });
    }
    if (
      capability === CREATIVE_TOOL_CAPABILITIES.MOTION_COMPOSE ||
      capability === CREATIVE_TOOL_CAPABILITIES.TITLE_ANIMATE ||
      capability === CREATIVE_TOOL_CAPABILITIES.LOWER_THIRD_RENDER
    ) {
      return CreativeRemotionRuntime.render({ project, ...input });
    }
  }

  if (selected_tool_id === "blender" && capability === CREATIVE_TOOL_CAPABILITIES.THREE_D_RENDER) {
    return CreativeBlenderRuntime.render({ project, scene: input?.scene || input });
  }

  if (selected_tool_id === "opencv") {
    if (capability === CREATIVE_TOOL_CAPABILITIES.CAMERA_TRACK) {
      return CreativeOpenCVCameraTrackRuntime.execute({ organization_id, project, ...input });
    }
    const openCvOperation = {
      [CREATIVE_TOOL_CAPABILITIES.OBJECT_TRACK]: "OBJECT_TRACK",
      [CREATIVE_TOOL_CAPABILITIES.OPTICAL_FLOW]: "OPTICAL_FLOW",
      [CREATIVE_TOOL_CAPABILITIES.SEGMENTATION]: "SEGMENTATION",
      [CREATIVE_TOOL_CAPABILITIES.MOTION_ANALYSE]: "MOTION_ANALYSE",
    }[capability];
    if (openCvOperation) {
      return CreativeOpenCVRuntime.execute({ organization_id, project, operation: openCvOperation, ...input });
    }
  }

  throw new Error(`CREATIVE_SANDBOX_CAPABILITY_EXECUTOR_MISSING:${selected_tool_id}:${capability}`);
}

export async function executeCreativeCapability({
  organization_id,
  creative_project_id,
  project,
  capability,
  input = {},
  preferred_runtime = null,
} = {}) {
  assertScope({ organization_id, creative_project_id });
  if (!project || project.id !== creative_project_id) throw new Error("CREATIVE_TOOL_EXECUTION_PROJECT_CONTEXT_REQUIRED");
  if (project.organization_id !== organization_id) throw new Error("CREATIVE_TOOL_EXECUTION_ORGANIZATION_MISMATCH");

  const requestedCapability = text(capability);
  if (!requestedCapability) throw new Error("CREATIVE_TOOL_CAPABILITY_REQUIRED");

  const resolution = CreativeToolResolverRuntime.resolve({ capability: requestedCapability, project, preferred_runtime, require_ready: false });
  const selected = resolution.selected;

  if (selected.runtime === CREATIVE_TOOL_RUNTIME.SANDBOX) {
    if (selected.status !== "READY") {
      const error = new Error(`CREATIVE_TOOL_BOOTSTRAP_REQUIRED:${selected.tool_id}`);
      error.details = publicResolution(resolution);
      throw error;
    }
    const output = await executeSandboxCapability({ organization_id, selected_tool_id: selected.tool_id, capability: requestedCapability, project, input });
    return { contract: CONTRACT, organization_id, creative_project_id, resolution: publicResolution(resolution), output };
  }

  if (selected.runtime === CREATIVE_TOOL_RUNTIME.LOCAL) {
    const error = new Error(`CREATIVE_LOCAL_CAPABILITY_EXECUTOR_REQUIRED:${requestedCapability}`);
    error.details = publicResolution(resolution);
    throw error;
  }
  if (selected.runtime === CREATIVE_TOOL_RUNTIME.SERVICE_RUNTIME) {
    const error = new Error(`CREATIVE_SERVICE_RUNTIME_EXECUTION_REQUIRED:${requestedCapability}`);
    error.details = publicResolution(resolution);
    throw error;
  }
  throw new Error(`CREATIVE_TOOL_RUNTIME_UNSUPPORTED:${selected.runtime}`);
}

export const CreativeToolExecutionRuntime = Object.freeze({ contract: CONTRACT, execute: executeCreativeCapability });
