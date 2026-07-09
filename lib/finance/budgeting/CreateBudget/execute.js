import {
  createBudgetDocument,
} from "../runtime/BudgetApplicationService";


export async function execute({
  context,
  payload = {},
}) {

  return await createBudgetDocument({

    ...payload,

    organization_id:
      context.organizationId,

    entity_id:
      context.entityId,

    period_id:
      context.periodId,

  });

}
