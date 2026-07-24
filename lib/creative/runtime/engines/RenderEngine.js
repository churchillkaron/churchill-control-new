import {
  CreativePostProductionRuntime,
} from "@/lib/creative/post-production/runtime/CreativePostProductionRuntime";

export const RenderEngine = {
  id: "render",

  async execute(context = {}) {
    const packageDocument = await CreativePostProductionRuntime.build({
      organization_id: context.organization_id,
      creative_project_id: context.creative_project_id,
    });

    if (packageDocument.status !== "READY_FOR_ASSEMBLY") {
      throw new Error("POST_PRODUCTION_PACKAGE_BLOCKED");
    }

    return {
      ...context,
      render_manifest: {
        edit_decision_list:
          packageDocument.editorial.edit_decision_list,
        graphics: packageDocument.graphics,
        audio: packageDocument.audio,
        finishing: packageDocument.finishing,
        exports: packageDocument.exports,
      },
      status: "READY_FOR_RENDER_INFRASTRUCTURE",
    };
  },
};
