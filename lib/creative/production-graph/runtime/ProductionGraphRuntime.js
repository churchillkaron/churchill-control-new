import {
  buildProductionGraph,
} from "../planner/ProductionGraphPlanner";

import {
  insertProductionQualityGates,
} from "../planner/ProductionQualityGatePlanner";

import {
  createProductionGraph,
} from "../documents/ProductionGraph";

import * as Repository from "../repositories/ProductionGraphRepository";

export const ProductionGraphRuntime = {
  async list(input = {}) {
    return Repository.listByProject(input);
  },

  async get(id) {
    return Repository.getById(id);
  },

  async create(input = {}) {
    return Repository.create(
      createProductionGraph(input),
    );
  },

  async update(id, values = {}) {
    return Repository.update(id, values);
  },

  async plan(input = {}) {
    return insertProductionQualityGates(
      buildProductionGraph(input),
    );
  },
};
