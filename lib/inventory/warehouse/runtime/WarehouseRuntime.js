import {
  createWarehouseTask,
} from "@/lib/operations/tasks/createWarehouseTask";

import {
  completeWarehouseTask,
} from "@/lib/operations/tasks/completeWarehouseTask";

import {
  createWarehouseTransfer,
} from "@/lib/inventory/warehouse/transfers/createWarehouseTransfer";

import {
  createPickTask,
} from "@/lib/inventory/warehouse/picking/createPickTask";


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
