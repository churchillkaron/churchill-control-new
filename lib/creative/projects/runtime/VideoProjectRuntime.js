import {
  createProject,
}
from "../services/VideoProjectService";

export async function startVideoProject(
  input
) {
  return createProject(
    input
  );
}
