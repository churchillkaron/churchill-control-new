import {
  createProductionGraph,
  createProductionNode,
  createProductionEdge,
} from "../documents/ProductionGraph";

export function buildProductionGraph({

  organization_id,

  creative_project_id,

  storyboard,

  scenes = [],

  shots = [],

}) {

  const graph =
    createProductionGraph({

      organization_id,

      creative_project_id,

      storyboard_id:
        storyboard?.id,

      title:
        storyboard?.title ||
        "Production Graph",

    });

  for (const scene of scenes) {

    graph.nodes.push(

      createProductionNode({

        id:
          scene.id,

        type:
          "SCENE",

        title:
          scene.title,

        duration_seconds:
          scene.duration_seconds,

      }),

    );

    const sceneShots =
      shots.filter(
        shot =>
          shot.scene_id === scene.id,
      );

    for (const shot of sceneShots) {

      graph.nodes.push(

        createProductionNode({

          id:
            shot.id,

          type:
            "SHOT",

          title:
            shot.title,

          duration_seconds:
            shot.duration_seconds,

          generation: {

            required: true,

            service:
              "creative.video.generate",

            capability:
              "creative.video.generate",

            estimated_cost:
              0,

            estimated_seconds:
              shot.duration_seconds,

            status:
              "WAITING",

          },

        }),

      );

      graph.edges.push(

        createProductionEdge({

          from:
            scene.id,

          to:
            shot.id,

          type:
            "CONTAINS",

        }),

      );

    }

  }

  return graph;

}
