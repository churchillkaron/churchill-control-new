import {
  CreativeAssetGraphRuntime,
} from "../graph/runtime/CreativeAssetGraphRuntime";

export const AssetReuseEngine = {

  async resolveNode(node, organization_id) {

    if (
      !node.generation?.required
    ) {
      return node;
    }

    const reusable =
      await CreativeAssetGraphRuntime.findReusable({

        organization_id,

        type:
          node.type,

        tags:
          node.metadata?.tags || [],

      });

    if (!reusable.length)
      return node;

    const asset =
      reusable[0];

    return {

      ...node,

      generation: {

        ...node.generation,

        required: false,

        reused: true,

        asset_id:
          asset.id,

        status:
          "REUSED",

      },

      assets: [

        ...(node.assets || []),

        asset.id,

      ],

    };

  },

  async optimizeGraph({

    organization_id,

    graph,

  }) {

    graph.nodes =
      await Promise.all(

        (graph.nodes || []).map(

          node =>

            this.resolveNode(

              node,

              organization_id,

            ),

        ),

      );

    return graph;

  },

};
