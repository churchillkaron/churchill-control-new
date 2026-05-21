export async function triggerProduction(
  order_id,
  tenant_id
) {

  try {

    await fetch(
      "/api/production/process-order",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({

          order_id,

          tenant_id,
        }),
      }
    );

  } catch (error) {

    console.error(
      "Production trigger failed",
      error
    );
  }
}
