import {
  getIntegrationRegistry,
} from "../integrations/registry/IntegrationRegistry";

import {
  createServiceUsageRecord,
} from "../usage/documents/ServiceUsageRecord";

import * as UsageRepository
from "../usage/repositories/ServiceUsageRepository";

import {
  calculateCustomerPrice,
} from "../pricing/ServicePricingEngine";

import {
  ExecutionRuntime,
} from "../execution/runtime/ExecutionRuntime";

export const PlatformServicesRuntime = {

  catalog() {

    return {
      categories:
        getIntegrationRegistry(),
    };

  },

  async execute(input) {

    return ExecutionRuntime.execute(
      input
    );

  },

  async recordUsage(input) {

    const pricing =
      calculateCustomerPrice({

        supplier_cost:
          Number(
            input.supplier_cost || 0
          ),

        markup_percent:
          Number(
            input.markup_percent || 30
          ),

        minimum_fee:
          Number(
            input.minimum_fee || 0
          ),

      });

    const record =
      createServiceUsageRecord({

        ...input,

        ...pricing,

      });

    return UsageRepository.create(
      record
    );

  },

  async usage(
    organizationId
  ) {

    return UsageRepository
      .listByOrganization(
        organizationId
      );

  },

};
