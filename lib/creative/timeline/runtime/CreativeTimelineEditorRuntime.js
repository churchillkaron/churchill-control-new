import {
  createCreativeTimeline,
} from "../documents/CreativeTimeline";

import * as Repository
from "../repositories/CreativeTimelineRepository";

export const CreativeTimelineEditorRuntime = {

  async create(input = {}) {

    return Repository.create(

      createCreativeTimeline(input)

    );

  },

  async update(

    id,

    values,

  ) {

    return Repository.update(

      id,

      values,

    );

  },

  async list(input = {}) {

    return Repository.listByProject(

      input,

    );

  },

};
