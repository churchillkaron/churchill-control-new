import {
  ServiceExecutionRuntime,
} from "../execution/ServiceExecutionRuntime.js";


export const runAIService = {


  async execute(input = {}) {

    return ServiceExecutionRuntime.execute({

      ...input,

      category:
        "AI",

    });

  },

};
