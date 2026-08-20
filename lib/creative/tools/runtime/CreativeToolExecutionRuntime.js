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

const CONTRACT = "CREATIVE_TOOL_EXECUTION_RUNTIME_V1";

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

async function executeSandboxCapability({ capability, project, input }) {
  if (
    capability === CREATIVE_TOOL_CAPABILITIES.UI_CAPTURE ||
    capability === CREATIVE_TOOL_CAPABILITIES.BROWSER_RECORD
  ) {
    if (capability === CREATIVE_TOOL_CAPABILITIES.BROWSER_RECORD) {
      throw new Error("CREATIVE_BROWSER_RECORD_EXECUTOR_NOT_IMPLEMENTED");
    }

    return CreativeBrowserCaptureRuntime.captureFrame({
      project,
      ...input,
    });
  }

  if (
    capability === CREATIVE_TOOL_CAPABILITIES.MOTION_COMPOSE ||
    capability === CREATIVE_TOOL_CAPABILITIES.ANIMATED_TITLE ||
    capability === CREATIVE_TOOL_CAPABILITIES.LOWER_THIRD ||
    capability === CREATIVE_TOOL_CAPABILITIES.HTML_RENDER ||
    capability === CREATIVE_TOOL_CAPABILITIES.SVG_RENDER
  ) {
    return CreativeRemotionRuntime.render({
      project,
      ...input,
    });
  }

  throw new Error(`CREATIVE_SANDBOX_CAPABILITY_EXECUTOR_MISSING:${capability}`);
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

  if (!project || project.id !== creative_project_id) {
    throw new Error("CREATIVE_TOOL_EXECUTION_PROJECT_CONTEXT_REQUIRED");
  }
  if (project.organization_id !== organization_id) {
    throw new Error("CREATIVE_TOOL_EXECUTION_ORGANIZATION_MISMATCH");
  }

  const requestedCapability = text(capability);
  if (!requestedCapability) {
    throw new Error("CREATIVE_TOOL_CAPABILITY_REQUIRED");
  }

  const resolution = CreativeToolResolverRuntime.resolve({
    capability: requestedCapability,
    project,
    preferred_runtime,
    require_ready: false,
  });

  const selected = resolution.selected;

  if (selected.runtime === CREATIVE_TOOL_RUNTIME.SANDBOX) {
    if (selected.status !== "READY") {
      const error = new Error(
        `CREATIVE_TOOL_BOOTSTRAP_REQUIRED:${selected.tool_id}`,
      );
      error.details = publicResolution(resolution);
      throw error;
    }

    const output = await executeSandboxCapability({
      capability: requestedCapability,
      project,
      input,
    });

    return {
      contract: CONTRACT,
      organization_id,
      creative_project_id,
      resolution: publicResolution(resolution),
      output,
    };
  }

  if (selected.runtime === CREATIVE_TOOL_RUNTIME.LOCAL) {
    const error = new Error(
      `CREATIVE_LOCAL_CAPABILITY_EXECUTOR_REQUIRED:${requestedCapability}`,
    );
    error.details = publicResolution(resolution);
    throw error;
  }

  if (selected.runtime === CREATIVE_TOOL_RUNTIME.SERVICE_RUNTIME) {
    const error = new Error(
      `CREATIVE_SERVICE_RUNTIME_EXECUTION_REQUIRED:${requestedCapability}`,
    );
    error.details = publicResolution(resolution);
    throw error;
  }

  throw new Error(`CREATIVE_TOOL_RUNTIME_UNSUPPORTED:${selected.runtime}`);
}

export const CreativeToolExecutionRuntime = Object.freeze({
  contract: CONTRACT,
  execute: executeCreativeCapability,
});
