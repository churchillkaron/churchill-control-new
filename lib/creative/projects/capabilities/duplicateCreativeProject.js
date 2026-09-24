import * as Repository
from "../repositories/CreativeProjectRepository.js";

export default async function duplicateProject(
  id,
) {

  return Repository.duplicate(
    id,
  );

}
