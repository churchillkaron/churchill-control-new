import {
  SceneRuntime,
} from "@/lib/creative/scenes/runtime/SceneRuntime";

import {
  ShotRuntime,
} from "@/lib/creative/shots/runtime/ShotRuntime";

import {
  CreativeAssetGraphRuntime,
} from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";

export const CreativeTimelineRuntime = {

  async build({
    organization_id,
    creative_project_id,
  }) {

    const scenes =
      await SceneRuntime.list({
        organization_id,
        creative_project_id,
      });

    const shots =
      await ShotRuntime.list({
        organization_id,
        creative_project_id,
      });

    const assets =
      await CreativeAssetGraphRuntime.list({
        organization_id,
        creative_project_id,
      });

    const timeline =
      scenes
        .sort(
          (a,b)=>
            a.scene_number-b.scene_number
        )
        .map(scene=>({

          ...scene,

          shots:
            shots
              .filter(
                s=>s.scene_id===scene.id
              )
              .sort(
                (a,b)=>
                  a.shot_number-b.shot_number
              )
              .map(shot=>({

                ...shot,

                assets:
                  assets.filter(a=>{

                    if(
                      a.metadata?.shot_id===shot.id
                    )
                      return true;

                    return false;

                  }),

              })),

        }));

    return {

      timeline,

      total_scenes:
        scenes.length,

      total_shots:
        shots.length,

      total_assets:
        assets.length,

    };

  },

};
