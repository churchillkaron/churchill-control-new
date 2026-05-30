export async function processEnterpriseRuntimeEvent({

  tenantId,

  event,

  payload,

}) {

  console.log(
    "[PROCESS_ENTERPRISE_RUNTIME_EVENT]",
    {
      tenantId,
      event,
      payload,
    }
  );

  return {

    success: true,

    tenantId,

    event,

    payload,

    processedAt:
      new Date().toISOString(),

  };

}
