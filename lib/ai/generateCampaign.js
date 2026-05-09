export async function generateCampaign({
  prompt,
  image,
}) {

  const response =
    await fetch(
      "/api/ai/enhance",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          prompt,
          image,
        }),
      }
    );

  const data =
    await response.json();

  if (!response.ok) {

    throw new Error(
      data?.error ||
      "Generation failed"
    );
  }

  return data;
}