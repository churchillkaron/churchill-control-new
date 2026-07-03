import {
  createCreativeProject,
} from "../documents/CreativeProject";

import * as Repository
from "../repositories/CreativeProjectRepository";

export default async function createProject(
  input,
) {

  const project =
    createCreativeProject(input);

  return Repository.create(
    project
  );

}
