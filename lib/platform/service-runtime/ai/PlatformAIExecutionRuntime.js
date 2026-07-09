import {
  ServiceExecutionRuntime,
} from "../execution/ServiceExecutionRuntime";


export const runAIService = {


  async execute(input = {}) {

    return ServiceExecutionRuntime.execute({

      ...input,

      category:
        "AI",

    });

  },

};
