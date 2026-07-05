import * as Repository
from "../repositories/ProductionRepository";

import {
  ProductionQueueRuntime,
} from "@/lib/creative/production/queue/runtime/ProductionQueueRuntime";

import {
  CreativeProviderExecutor,
} from "@/lib/creative/providers/runtime/CreativeProviderExecutor";

export const ProductionRuntime = {

  async list(input = {}) {

    return Repository.list(
      input,
    );

  },

  async get(id) {

    return Repository.get(
      id,
    );

  },

  async create(document = {}) {

    return Repository.create(
      document,
    );

  },

  async update(
    id,
    values = {},
  ) {

    return Repository.update(
      id,
      values,
    );

  },

  async runProduction({
    organization_id,
    creative_project_id,
  }) {

    await ProductionQueueRuntime.dispatchAll({

      organization_id,

      creative_project_id,

    });

    const assets =
      await CreativeProviderExecutor.processAll({

        organization_id,

        creative_project_id,

      });

    return {

      success: true,

      assets_created:
        assets.filter(Boolean).length,

    };

  },

};
