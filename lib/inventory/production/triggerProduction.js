export async function triggerProduction(
  order_id,
  organization_id
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

          organization_id,
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
