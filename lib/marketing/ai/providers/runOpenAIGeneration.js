export async function runOpenAIGeneration({

  prompt,

  poster,

  pageId,

  selectedBusiness,

  engine,

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

            poster,

            pageId,

            selectedBusiness,

            engine,

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

    // NORMALIZED RESPONSE

    return {

      success: true,

      imageUrl:
        data.imageUrl,

      provider:
        "openai",

      model:
        data.model ||
        "gpt-image-1",

      engine,

      pageId,

      businessName:
        selectedBusiness
          ?.page_name || "",

      raw:
        data,

    };

  } catch (err) {

    console.error(

      "OPENAI GENERATION ERROR:",

      err

    );

    throw err;

  }

}