import {
  createCreativeAsset,
} from "../documents/CreativeAsset";

import * as Repository
from "../repositories/CreativeAssetRepository";

export default async function createAsset(
  input,
) {

  return Repository.create(

    createCreativeAsset(
      input
    )

  );

}
