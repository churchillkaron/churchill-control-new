import {
  createWarehouseTask,
} from "@/lib/warehouse/tasks/createWarehouseTask";

import {
  completeWarehouseTask,
} from "@/lib/warehouse/tasks/completeWarehouseTask";

import {
  createWarehouseTransfer,
} from "@/lib/warehouse/transfers/createWarehouseTransfer";

import {
  createPickTask,
} from "@/lib/warehouse/picking/createPickTask";


export const WarehouseRuntime = {

  domain:
    "warehouse",


  capabilities: {

    createTask:
      createWarehouseTask,

    completeTask:
      completeWarehouseTask,

    createTransfer:
      createWarehouseTransfer,

    createPick:
      createPickTask,

  },


  taskTypes: [

    "PUTAWAY",

    "TRANSFER_OUT",

    "TRANSFER_IN",

    "PICK",

    "CYCLE_COUNT",

  ],


  documents: {

    task:
      "warehouse_task",

    transfer:
      "warehouse_transfer",

  },

};
