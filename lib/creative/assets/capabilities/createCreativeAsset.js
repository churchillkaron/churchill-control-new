import {
  createCreativeAsset,
} from "../documents/CreativeAsset.js";

import * as Repository
from "../repositories/CreativeAssetRepository.js";

export default async function createAsset(
  input,
) {

  return Repository.create(

    createCreativeAsset(
      input
    )

  );

}
