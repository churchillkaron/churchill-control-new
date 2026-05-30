import {
  registerJobHandler,
} from "@/lib/queue/handlers/jobHandlerRegistry";

import {
  runWorkflows,
} from "@/lib/workflows/runWorkflows";

import {
  registerWorkflow,
} from "@/lib/workflows/workflowRegistry";

import {
  goodsReceiptCreatedWorkflow,
} from "@/lib/procurement/workflows/goodsReceiptCreatedWorkflow";

import {
  journalEntryCreatedWorkflow,
} from "@/lib/finance/workflows/journalEntryCreatedWorkflow";

import {
  saleCompletedWorkflow,
} from "@/lib/sales/workflows/saleCompletedWorkflow";

import {
  createCogsWorkflow,
} from "@/lib/finance/workflows/createCogsWorkflow";

import {
  vendorInvoiceCreatedWorkflow,
} from "@/lib/finance/workflows/vendorInvoiceCreatedWorkflow";

import {
  vendorPaymentWorkflow,
} from "@/lib/finance/workflows/vendorPaymentWorkflow";

import {
  periodCloseWorkflow,
} from "@/lib/finance/workflows/periodCloseWorkflow";

registerWorkflow(

  "GOODS_RECEIPT_CREATED",

  goodsReceiptCreatedWorkflow

);

registerJobHandler(

  "WORKFLOW_EVENT",

  async (payload) => {

    if (!payload?.event) {

      throw new Error(
        "WORKFLOW_EVENT requires event"
      );

    }

    return await runWorkflows(

      payload.event,

      payload.payload || {}

    );

  }

);

registerJobHandler(

  "AI_TASK",

  async (payload) => {

    console.log(
      "[AI_TASK_HANDLER]",
      payload
    );

    return {
      success: true,
    };

  }

);

console.log(
  "[QUEUE_HANDLERS_REGISTERED]"
);

console.log(
  "[WORKFLOWS_REGISTERED_IN_WORKER_RUNTIME]"
);


registerWorkflow(

  "JOURNAL_ENTRY_CREATED",

  journalEntryCreatedWorkflow

);


registerWorkflow(

  "SALE_COMPLETED",

  saleCompletedWorkflow

);


registerWorkflow(

  "CREATE_COGS",

  createCogsWorkflow

);


registerWorkflow(

  "VENDOR_INVOICE_CREATED",

  vendorInvoiceCreatedWorkflow

);


registerWorkflow(

  "VENDOR_PAYMENT",

  vendorPaymentWorkflow

);


registerWorkflow(

  "PERIOD_CLOSE",

  periodCloseWorkflow

);
