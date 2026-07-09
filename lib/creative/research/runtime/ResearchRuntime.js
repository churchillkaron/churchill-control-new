import {
  createResearchReport,
} from "../documents/ResearchReport";

import {
  buildResearchPlan,
} from "../reasoning/ResearchDirector";

import * as Repository
from "../repositories/ResearchRepository";

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

  async list(input = {}) {
    return Repository.list(input);
  },

  async get(id) {
    return Repository.get(id);
  },

  async create(input = {}) {
    return Repository.create(input);
  },

  async update(id, values = {}) {
    return Repository.update(id, values);
  },

  runResearch,

};
