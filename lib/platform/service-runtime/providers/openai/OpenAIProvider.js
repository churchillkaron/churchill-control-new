import OpenAI from "openai";


const openai =
  new OpenAI({

    apiKey:
      process.env.OPENAI_API_KEY,

  });



export const OpenAIProvider = {


  id:"openai",



  async execute({

    capability,

    model,

    prompt,

    image,

    assets,

    poster,

    messages,

    input,

  } = {}) {



    const selectedModel =
      model ||
      "gpt-4.1";



    switch(capability) {



      case "ai.image.generate":

        return generateImage({

          prompt,

          poster,

          assets,

        });



      case "ai.text.generate":

      case "ai.reasoning.execute":

        return generateText({

          model:selectedModel,

          prompt,

          messages,

        });



      case "document.classify":

      case "document.ocr":

      case "ai.image.analyze":

        return analyzeDocument({

          model:selectedModel,

          prompt,

          image,

        });



      default:

        throw new Error(
          `OpenAI capability not supported: ${capability}`
        );

    }

  },

};




async function generateImage({

  prompt,

  poster,

  assets,

}) {


  const response =
    await openai.images.generate({

      model:
        "gpt-image-1",

      prompt:

`
Luxury commercial image.

Business:
${poster?.venue || ""}

Campaign:
${poster?.campaignType || ""}

Mood:
${poster?.mood || ""}

Atmosphere:
${poster?.atmosphere || ""}

Direction:
${poster?.extraDirection || ""}

${prompt || ""}

No text.
No watermark.
Professional advertising photography.
`,

      size:
        "1024x1024",

    });



  return {

    success:true,

    output:{

      image_url:
        response?.data?.[0]?.url ||
        null,

      assets,

    },

  };

}




async function generateText({

  model,

  prompt,

  messages,

}) {


  const response =
    await openai.responses.create({

      model,

      input:

        messages ||
        prompt ||
        "",

    });



  return {

    success:true,

    output:{

      text:
        response.output_text ||
        "",

    },

  };

}




async function analyzeDocument({

  model,

  prompt,

  image,

}) {


  const response =
    await openai.responses.create({

      model,

      input:[

        {

          role:"user",

          content:[

            {

              type:"input_text",

              text:
                prompt || "Analyze document",

            },

            {

              type:"input_image",

              image_url:
                image,

            },

          ],

        },

      ],

    });



  return {

    success:true,

    output:{

      text:
        response.output_text ||
        "",

    },

  };

}
