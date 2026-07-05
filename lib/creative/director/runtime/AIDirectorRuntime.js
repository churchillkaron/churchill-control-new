import {
  createAIDirectorDecision,
  AI_DIRECTOR_DECISION_TYPES,
} from "../documents/AIDirectorDecision";

import * as Repository
from "../repositories/AIDirectorRepository";

export const AIDirectorRuntime = {

  async list(input = {}) {

    return Repository.list(input);

  },

  async get(id) {

    return Repository.get(id);

  },

  async create(input = {}) {

    return Repository.create(

      createAIDirectorDecision(input),

    );

  },

  async update(id, values = {}) {

    return Repository.update(
      id,
      values,
    );

  },

  async createStrategyDecision({
    organization_id,
    creative_project_id,
    creative_brief_id,
    brief = {},
  } = {}) {

    return this.create({

      organization_id,
      creative_project_id,
      creative_brief_id,

      type:
        AI_DIRECTOR_DECISION_TYPES.STRATEGY,

      title:
        "Creative Strategy Decision",

      summary:
        "Convert business intent into creative direction.",

      cost_impact: {

        currency:
          brief?.budget?.currency || "USD",

        estimated_cost:
          Number(
            brief?.budget?.estimated_cost || 0
          ),

      },

    });

  },

};
