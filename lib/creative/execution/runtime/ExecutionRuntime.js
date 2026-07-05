import {
  buildExecutionPlan,
} from "../planner/ExecutionPlanner";

import {
  createExecutionPlan,
} from "../documents/ExecutionPlan";

import * as Repository
from "../repositories/ExecutionRepository";

export const ExecutionRuntime = {

  async list(input = {}) {

    return Repository.listByProject(input);

  },

  async create(input = {}) {

    return Repository.create(

      createExecutionPlan(input),

    );

  },

  async update(
    id,
    values,
  ) {

    return Repository.update(
      id,
      values,
    );

  },

  async plan({

    organization_id,

    creative_project_id,

    production_graph,

  }) {

    return buildExecutionPlan({

      organization_id,

      creative_project_id,

      production_graph,

    });

  },

};
