import { CreativeMissionRuntime } from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import { CreativeProjectRuntime } from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function createdAt(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
}

function assertOrganization(project, organizationId) {
  if (!project || text(project.organization_id) !== text(organizationId)) {
    const error = new Error("CREATIVE_OPERATOR_PROJECT_NOT_FOUND");
    error.status = 404;
    throw error;
  }
  return project;
}

export async function resolveOperatorCreativeProject({
  organizationId,
  creativeProjectId = null,
  requestRef = null,
} = {}) {
  const organization = text(organizationId);
  const projectId = text(creativeProjectId);
  const reference = text(requestRef);

  if (!organization) {
    const error = new Error("organization_id required");
    error.status = 400;
    throw error;
  }

  if (projectId) {
    const project = assertOrganization(
      await CreativeProjectRuntime.get(projectId),
      organization,
    );
    return {
      project,
      mission: null,
      request_ref: text(project?.metadata?.source_reference) || reference || null,
    };
  }

  if (!reference) {
    const error = new Error("CREATIVE_OPERATOR_PROJECT_REFERENCE_REQUIRED");
    error.status = 400;
    throw error;
  }

  const missions = await CreativeMissionRuntime.list({ organization_id: organization });
  const mission = missions
    .filter((candidate) => {
      const metadata = object(candidate?.metadata);
      return (
        text(metadata.source_reference) === reference &&
        text(candidate?.organization_id) === organization
      );
    })
    .sort((left, right) => createdAt(right?.created_at) - createdAt(left?.created_at))[0];

  if (!mission) {
    const error = new Error("CREATIVE_OPERATOR_PROJECT_NOT_FOUND");
    error.status = 404;
    throw error;
  }

  const project = assertOrganization(
    await CreativeProjectRepository.getByMission({
      organization_id: organization,
      creative_mission_id: mission.id,
    }),
    organization,
  );

  return {
    project,
    mission,
    request_ref: reference,
  };
}

export default {
  resolve: resolveOperatorCreativeProject,
};
