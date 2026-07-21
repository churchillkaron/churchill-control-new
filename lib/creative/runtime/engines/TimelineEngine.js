import {
  CreativePostProductionRuntime,
} from "@/lib/creative/post-production/runtime/CreativePostProductionRuntime";

export const TimelineEngine = {
  id: "timeline",

  async execute(context = {}) {
    const packageDocument = await CreativePostProductionRuntime.build({
      organization_id: context.organization_id,
      creative_project_id: context.creative_project_id,
    });

    return {
      ...context,
      timeline: packageDocument.editorial,
      graphics: packageDocument.graphics,
      status: packageDocument.status,
      missing_requirements: packageDocument.missing_requirements,
    };
  },
};
