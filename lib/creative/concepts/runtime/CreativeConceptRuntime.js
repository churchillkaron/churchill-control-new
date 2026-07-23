import {
  createCreativeConcept,
} from "../documents/CreativeConcept";

import {
  CreativeConceptRepository,
} from "../repositories/CreativeConceptRepository";

function normalizeScope(input = {}) {
  if (typeof input === "string") {
    return {
      organization_id: input,
      creative_project_id: null,
      creative_mission_id: null,
    };
  }

  return {
    ...input,
    organization_id:
      input.organization_id ||
      input.organizationId ||
      null,
    creative_project_id:
      input.creative_project_id ||
      input.creativeProjectId ||
      input.project_id ||
      input.projectId ||
      null,
    creative_mission_id:
      input.creative_mission_id ||
      input.creativeMissionId ||
      input.mission_id ||
      input.missionId ||
      null,
  };
}

export const CreativeConceptRuntime = {
  async get(id, input = {}) {
    const scope = normalizeScope(input);

    return CreativeConceptRepository.get({
      id,
      organization_id: scope.organization_id,
      creative_project_id:
        scope.creative_project_id || null,
    });
  },

  async create(input = {}) {
    const scope = normalizeScope(input);

    return CreativeConceptRepository.create(
      createCreativeConcept({
        ...input,
        organization_id: scope.organization_id,
        creative_project_id:
          scope.creative_project_id || null,
        creative_mission_id:
          scope.creative_mission_id || null,
      }),
    );
  },

  async list(input = {}) {
    return CreativeConceptRepository.list(
      normalizeScope(input),
    );
  },

  async update(id, values = {}, input = {}) {
    const scope = normalizeScope({
      ...values,
      ...input,
    });

    return CreativeConceptRepository.update({
      id,
      organization_id: scope.organization_id,
      creative_project_id:
        scope.creative_project_id || null,
      values: {
        ...values,
        organization_id:
          values.organization_id ||
          values.organizationId ||
          scope.organization_id,
        creative_project_id:
          values.creative_project_id ||
          values.creativeProjectId ||
          values.project_id ||
          values.projectId ||
          scope.creative_project_id ||
          null,
        creative_mission_id:
          values.creative_mission_id ||
          values.creativeMissionId ||
          values.mission_id ||
          values.missionId ||
          scope.creative_mission_id ||
          null,
      },
    });
  },

  async archive(id, input = {}) {
    return this.update(
      id,
      {
        archived_at: new Date().toISOString(),
        revision_reason:
          "Archive creative concept",
      },
      input,
    );
  },

  async resolve(input = {}, permissions = []) {
    const scope = normalizeScope(input);
    const items = await this.list(scope);
    const current = items[0] || null;

    return {
      current,
      items,
      commands: [
        "create",
        "update",
        "archive",
      ],
      status: current?.status || "ready",
      permissions,
    };
  },
};
