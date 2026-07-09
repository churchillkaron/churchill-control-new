import { getEngine } from "@/lib/platform/engines/EngineRegistry";


export function executeWorkspaceAction({

  action,

  context = {},

}) {

  if (!action) {
    throw new Error(
      "Action required"
    );
  }


  const engineName =
    action.engine ||
    null;


  if (!engineName) {

    throw new Error(
      "Action engine missing"
    );

  }


  const Engine =
    getEngine(engineName);


  if (!Engine) {

    throw new Error(
      `Engine not registered: ${engineName}`
    );

  }


  return {

    Engine,

    props:{

      action,

      context,

      organizationId:
        context.organizationId,

      entityId:
        context.entityId,

      workspaceId:
        context.workspaceId,

      moduleKey:
        context.moduleKey,

      row:
        context.row,

    }

  };

}
