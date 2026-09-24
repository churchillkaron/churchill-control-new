import {
  createCreativeProject,
} from "../documents/CreativeProject.js";

import * as Repository
from "../repositories/CreativeProjectRepository.js";

export default async function createProject(
  input,
) {

  const project =
    createCreativeProject(input);

  return Repository.create(
    project
  );

}
