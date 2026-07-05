import {
  createResearchReport,
} from "../documents/ResearchReport";

import {
  buildResearchPlan,
} from "../reasoning/ResearchDirector";

export async function runResearch(
  project,
  brief,
  reasoningProvider,
) {

  const report =
    createResearchReport({

      project_id:
        project.id,

      brief_id:
        brief.id,

    });

  const plan =
    await buildResearchPlan(
      project,
      brief,
    );

  const result =
    await reasoningProvider.run({

      project,

      brief,

      plan,

    });

  return {

    ...report,

    ...result,

  };

}

export const ResearchRuntime = {
  runResearch,
};
