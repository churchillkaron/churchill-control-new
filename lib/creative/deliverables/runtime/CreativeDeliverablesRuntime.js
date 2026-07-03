import createCreativeDeliverable
from "../capabilities/createCreativeDeliverable";

import * as Repository
from "../repositories/CreativeDeliverableRepository";

export const CreativeDeliverablesRuntime = {

  create:
    createCreativeDeliverable,

  get:
    Repository.getById,

  list:
    Repository.listByProject,

  update:
    Repository.update,

};
