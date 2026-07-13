import {
  buildWorkspaceAction,
} from "@/lib/platform/actions/WorkspaceActionCatalog";


export async function executeActions({

  actions = [],

  context = {},

} = {}) {


  const proposals =
    actions.map((item) => {


      const capability =
        item.capability ||
        "ai.recommendation";


      const action =
        buildWorkspaceAction({

          workspaceId:
            item.workspaceId ||
            context.workspaceId ||
            "ai",

          itemId:
            item.type ||
            "recommendation",

          actionId:
            item.actionId ||
            "ai",

          item: {

            capability,

            domain:
              item.domain ||
              null,

            category:
              item.type ||
              null,

          },

          overrides: {

            source:
              "AI",

            provider:
              item.provider ||
              null,

            recommendation:
              item.action ||
              item.message ||
              null,

            requiresApproval:
              true,

          },

        });


      return {

        status:
          "PENDING_APPROVAL",

        action,

        source:
          "BUSINESS_INTELLIGENCE",

      };

    });


  return proposals;

}
