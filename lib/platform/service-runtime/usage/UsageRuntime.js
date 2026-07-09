import {
  createServiceUsageRecord,
} from "./documents/ServiceUsageRecord";

import * as ServiceUsageRepository
from "./repositories/ServiceUsageRepository";


export const UsageRuntime = {


  async record(input = {}) {

    const record =
      createServiceUsageRecord(
        input
      );


    return ServiceUsageRepository.create(
      record
    );

  },


  async organization(
    organization_id
  ) {

    return ServiceUsageRepository.listByOrganization(
      organization_id
    );

  },


  async provider({
    organization_id,
    provider,
  }) {

    const rows =
      await ServiceUsageRepository.listByOrganization(
        organization_id
      );


    return rows.filter(
      row =>
        row.provider === provider
    );

  },


  async capability({
    organization_id,
    capability,
  }) {

    const rows =
      await ServiceUsageRepository.listByOrganization(
        organization_id
      );


    return rows.filter(
      row =>
        row.capability === capability
    );

  },


};
