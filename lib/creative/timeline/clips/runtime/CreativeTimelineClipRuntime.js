import {
  createCreativeTimelineClip,
} from "../documents/CreativeTimelineClip";

import * as Repository
from "../repositories/CreativeTimelineClipRepository";

export const CreativeTimelineClipRuntime = {

  async create(input = {}) {

    return Repository.create(

      createCreativeTimelineClip(input)

    );

  },

  async update(id, values) {

    return Repository.update(

      id,

      values,

    );

  },

  async list({

    timeline_id,

  }) {

    return Repository.listByTimeline(

      timeline_id,

    );

  },

};
