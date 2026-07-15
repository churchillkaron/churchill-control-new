import {
  createProductionTask,
  PRODUCTION_TASK_STATUS,
} from "../documents/ProductionTask";

import * as Repository
from "../repositories/ProductionTaskRepository";

import {
  runAIService,
} from "@/lib/platform/service-runtime/ai";

import {
  resolveCreativeService,
} from "@/lib/creative/services/CreativeServiceResolver";

export const ProductionTaskRuntime = {

  async list(input = {}) {
    return Repository.listByProject(input);
  },

  async get(id) {
    return Repository.getById(id);
  },

  async create(input = {}) {
    const task = createProductionTask(input);
    return Repository.create(task);
  },

  async update(id, values = {}) {
    return Repository.update(id, values);
  },

  async markReady(id) {
    return Repository.update(id,{
      status:PRODUCTION_TASK_STATUS.READY,
    });
  },

  async fail(id,error){
    return Repository.update(id,{
      status:PRODUCTION_TASK_STATUS.FAILED,
      error:error?.message||String(error),
    });
  },

  async complete(id,output={}){

    const task =
      await Repository.getById(id);

    return Repository.update(id,{

      status:
        PRODUCTION_TASK_STATUS.COMPLETED,

      output:{
        ...(task.output||{}),
        ...output,
      },

      timing:{
        ...(task.timing||{}),
        completed_at:
          new Date().toISOString(),
      },

    });

  },

  async markCompleted(id,output={}){
    return this.complete(id,output);
  },

  async dispatch(id){

    const task =
      await Repository.getById(id);

    await Repository.update(id,{
      status:
        PRODUCTION_TASK_STATUS.RUNNING,
      timing:{
        ...(task.timing||{}),
        started_at:
          task.timing?.started_at ||
          new Date().toISOString(),
      },
    });

    try{

      const result =
        await runAIService.execute({

          organization_id:
            task.organization_id,

          service_id:
            resolveCreativeService(task),

          estimated_cost:
            task.cost?.estimated || 0,

          operation:
            task.type,

          input:
            task.input,

          metadata:{
            task,
          },

        });

      return Repository.update(id,{

        status:
          PRODUCTION_TASK_STATUS.RUNNING,

        output:{
          ...(task.output||{}),
          provider_submission:
            result,
        },

      });

    }catch(error){

      return this.fail(
        id,
        error,
      );

    }

  },

};
