import * as Repository
from "../repositories/CreativeProjectRepository.js";

export default async function archiveProject(
  id,
) {

  return Repository.archive(
    id,
  );

}
