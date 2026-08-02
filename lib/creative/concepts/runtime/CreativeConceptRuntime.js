import {
  createCreativeConcept,
} from "../documents/CreativeConcept";

import {
  CreativeConceptRepository as Repository,
} from "../repositories/CreativeConceptRepository";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function organizationId(input = {}) {
  if (typeof input === "string") return input;
  return input.organization_id || input.organizationId || null;
}

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function databaseIdentity(input = {}) {
  const supplied = text(input.id);
  return UUID_PATTERN.test(supplied) ? supplied : null;
}

function conceptDocumentInput(input = {}) {
  const semanticConceptId = text(input.id);
  const databaseId = databaseIdentity(input);
  const metadata = object(input.metadata);
  const sanitized = {
    ...input,
    metadata: {
      ...metadata,
      ...(semanticConceptId && !databaseId
        ? {
            semantic_concept_id: semanticConceptId,
            semantic_concept_id_source:
              metadata.semantic_concept_id_source ||
              "CREATIVE_DIRECTION_PLAN",
            database_identity_separated: true,
          }
        : {}),
    },
  };

  if (databaseId) {
    sanitized.id = databaseId;
  } else {
    delete sanitized.id;
  }

  return sanitized;
}

export const CreativeConceptRuntime = {
  async get(id) {
    return Repository.get(id);
  },

  async create(input = {}) {
    return Repository.create(
      createCreativeConcept(conceptDocumentInput(input)),
    );
  },

  async list(input = {}) {
    const resolvedOrganizationId = organizationId(input);
    if (!resolvedOrganizationId) throw new Error("organization_id required");
    return Repository.list({
      organization_id: resolvedOrganizationId,
      creative_mission_id:
        typeof input === "object" ? input.creative_mission_id || null : null,
      creative_project_id:
        typeof input === "object" ? input.creative_project_id || null : null,
    });
  },

  async update(id, values = {}) {
    return Repository.update(id, values);
  },

  async archive(id) {
    return Repository.update(id, {
      archived_at: new Date().toISOString(),
    });
  },

  async resolve(input = {}, permissions = []) {
    const items = await this.list(input);
    const current = items[0] || null;
    return {
      current,
      items,
      commands: ["create", "update", "archive"],
      status: current?.status || "ready",
      permissions,
    };
  },
};
