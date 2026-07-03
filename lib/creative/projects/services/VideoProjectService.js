import {
  createVideoProject,
} from "../documents/VideoProject";

import {
  validateVideoProject,
} from "./VideoProjectValidationService";

import * as Repository
from "../repositories/VideoProjectRepository";

export async function createProject(input) {

  const project =
    createVideoProject(input);

  validateVideoProject(project);

  return Repository.create(project);

}

export async function getProject(id) {
  return Repository.get(id);
}

export async function listProjects(
  organization_id
) {
  return Repository.list(
    organization_id
  );
}

export async function updateProject(
  id,
  values
) {
  return Repository.update(
    id,
    values
  );
}
