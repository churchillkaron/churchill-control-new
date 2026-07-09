export async function processEnterpriseRuntimeEvent({

  tenantId,

  event,

  payload,

}) {

  if (process.env.NODE_ENV !== "production") console.log(
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
