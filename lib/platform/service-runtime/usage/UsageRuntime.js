import * as ServiceUsageRepository
from "./repositories/ServiceUsageRepository";

export const UsageRuntime = {

  async record(
    usage
  ) {
    return ServiceUsageRepository.create(
      usage
    );
  },

  async organization(
    organizationId
  ) {
    return ServiceUsageRepository.listByOrganization(
      organizationId
    );
  },

  async provider(
    organizationId,
    provider
  ) {

    const rows =
      await ServiceUsageRepository.listByOrganization(
        organizationId
      );

    return rows.filter(
      r => r.provider === provider
    );

  },

  async workspace(
    organizationId,
    workspace
  ) {

    const rows =
      await ServiceUsageRepository.listByOrganization(
        organizationId
      );

    return rows.filter(
      r => r.workspace === workspace
    );

  },

  async project(
    organizationId,
    projectId
  ) {

    const rows =
      await ServiceUsageRepository.listByOrganization(
        organizationId
      );

    return rows.filter(
      r => r.project_id === projectId
    );

  },

};
