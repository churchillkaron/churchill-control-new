import crypto from "crypto";

export function createCreativeTimelineClip(data = {}) {

  return {

    id:
      crypto.randomUUID(),

    organization_id:
      data.organization_id,

    creative_project_id:
      data.creative_project_id,

    timeline_id:
      data.timeline_id,

    track_id:
      data.track_id,

    asset_id:
      data.asset_id,

    start_seconds:
      data.start_seconds || 0,

    end_seconds:
      data.end_seconds || 5,

    trim_in_seconds:
      data.trim_in_seconds || 0,

    trim_out_seconds:
      data.trim_out_seconds || 0,

    speed:
      data.speed || 1,

    volume:
      data.volume ?? 100,

    transition:
      data.transition || null,

    effects:
      data.effects || [],

    subtitle:
      data.subtitle || null,

    created_at:
      new Date().toISOString(),

    updated_at:
      new Date().toISOString(),

  };

}
