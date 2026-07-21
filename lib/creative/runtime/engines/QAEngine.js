import {
  CreativePostProductionRuntime,
} from "@/lib/creative/post-production/runtime/CreativePostProductionRuntime";

export const QAEngine = {
  id: "qa",

  async execute(context = {}) {
    const packageDocument = await CreativePostProductionRuntime.build({
      organization_id: context.organization_id,
      creative_project_id: context.creative_project_id,
    });

    const blockers = [
      ...(packageDocument.missing_requirements || []),
    ];

    return {
      ...context,
      passed:
        packageDocument.status === "READY_FOR_ASSEMBLY" &&
        blockers.length === 0,
      quality_control:
        packageDocument.final_quality_control,
      blockers,
      exports: packageDocument.exports,
      status:
        blockers.length === 0
          ? "READY_FOR_FINAL_QA"
          : "BLOCKED",
    };
  },
};
