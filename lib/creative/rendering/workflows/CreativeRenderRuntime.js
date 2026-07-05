import {
  ProductionTaskRuntime,
} from "@/lib/creative/production/tasks/runtime/ProductionTaskRuntime";

import {
  CreativeProviderRuntime,
} from "@/lib/creative/providers/runtime/CreativeProviderRuntime";

export const CreativeRenderRuntime = {

  async renderProject({
    organization_id,
    creative_project_id,
    strategy="cost_optimized",
  }) {

    const tasks =
      await ProductionTaskRuntime.list({
        organization_id,
        creative_project_id,
      });

    const results=[];

    for(const task of tasks){

      if(
        task.status==="COMPLETED" ||
        task.status==="RUNNING"
      ){
        continue;
      }

      const result=
        await CreativeProviderRuntime.executeTask({

          task,

          strategy,

        });

      results.push({

        task_id:
          task.id,

        provider:
          result.provider_id,

        capability:
          result.capability,

        status:
          result.success
            ? "RUNNING"
            : "FAILED",

      });

    }

    return{

      project_id:
        creative_project_id,

      dispatched:
        results,

      total:
        results.length,

    };

  },

};
