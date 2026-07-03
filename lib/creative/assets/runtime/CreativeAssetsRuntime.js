import createCreativeAsset
from "../capabilities/createCreativeAsset";

import * as Repository
from "../repositories/CreativeAssetRepository";

export const CreativeAssetsRuntime = {

  create:
    createCreativeAsset,

  list:
    Repository.listByProject,

};
