import * as Repository
from "../repositories/CreativeProjectRepository";

export default async function updateProject(
  id,
  values,
) {

  return Repository.update(
    id,
    values,
  );

}
