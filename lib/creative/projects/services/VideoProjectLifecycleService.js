import * as Repository from "../repositories/VideoProjectRepository";

import {
  transitionProject,
} from "../ProjectLifecycle";

export async function changeProjectStatus(
  projectId,
  nextStatus
) {

  const project =
    await Repository.get(projectId);

  if (!project) {
    throw new Error(
      "Video project not found."
    );
  }

  const updated =
    transitionProject(
      project,
      nextStatus
    );

  return Repository.update(
    projectId,
    updated
  );

}
