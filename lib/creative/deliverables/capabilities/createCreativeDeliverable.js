import {
  createCreativeDeliverable,
} from "../documents/CreativeDeliverable";

import * as Repository
from "../repositories/CreativeDeliverableRepository";

export default async function createDeliverable(
  input,
) {

  return Repository.create(

    createCreativeDeliverable(
      input
    )

  );

}
