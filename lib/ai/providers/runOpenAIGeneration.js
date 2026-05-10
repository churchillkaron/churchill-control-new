export async function runOpenAIGeneration({

  prompt,

}) {

  try {

    const response =
      await fetch(

        "/api/ai/generate",

        {

          method: "POST",

          headers: {

            "Content-Type":
              "application/json",

          },

          body: JSON.stringify({

            prompt,

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

    return {

      success: true,

      imageUrl:
        data.imageUrl,

      provider:
        "openai",

    };

  } catch (err) {

    console.error(

      "OPENAI GENERATION ERROR:",

      err

    );

    throw err;

  }

}