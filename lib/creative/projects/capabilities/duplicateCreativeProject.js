import * as Repository
from "../repositories/CreativeProjectRepository";

export default async function duplicateProject(
  id,
) {

  return Repository.duplicate(
    id,
  );

}
