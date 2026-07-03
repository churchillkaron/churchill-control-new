import * as Repository
from "../repositories/CreativeProjectRepository";

export default async function archiveProject(
  id,
) {

  return Repository.archive(
    id,
  );

}
