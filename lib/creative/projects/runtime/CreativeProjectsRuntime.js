import createCreativeProject
from "../capabilities/createCreativeProject";

import updateCreativeProject
from "../capabilities/updateCreativeProject";

import archiveCreativeProject
from "../capabilities/archiveCreativeProject";

import duplicateCreativeProject
from "../capabilities/duplicateCreativeProject";

import * as Repository
from "../repositories/CreativeProjectRepository";

export const CreativeProjectsRuntime = {

  create:
    createCreativeProject,

  update:
    updateCreativeProject,

  archive:
    archiveCreativeProject,

  duplicate:
    duplicateCreativeProject,

  get:
    Repository.getById,

  list:
    Repository.listByOrganization,

};
