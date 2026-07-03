export function validateVideoProject(project) {

  if (!project.organization_id) {
    throw new Error(
      "organization_id required"
    );
  }

  if (!project.name?.trim()) {
    throw new Error(
      "Project name required"
    );
  }

  if (
    project.duration_seconds < 5
  ) {
    throw new Error(
      "Minimum duration is 5 seconds."
    );
  }

  if (
    project.duration_seconds > 600
  ) {
    throw new Error(
      "Maximum duration is 600 seconds."
    );
  }

  return true;

}
