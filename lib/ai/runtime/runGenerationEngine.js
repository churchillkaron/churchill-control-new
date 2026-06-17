import { providerRegistry }
from "@/lib/ai/router/providerRegistry";

export async function runGenerationEngine({

  engine,

  prompt,

  poster,

  pageId,

  selectedBusiness,

}) {

  try {

    // VALIDATION

    if (!pageId) {

      throw new Error(
        "No business/page selected"
      );

    }

    if (!selectedBusiness) {

      throw new Error(
        "No business context found"
      );

    }

    // ENGINE CONFIG

    const engineConfig =

      providerRegistry[
        engine
      ];

    if (!engineConfig) {

      throw new Error(

        `No provider configured for engine: ${engine}`

      );

    }

    // EXECUTE ENGINE

    const generation =

      await engineConfig.runner({

        prompt,

        poster,

        pageId,

        selectedBusiness,

        engine,

      });

    return {

      ...generation,

      provider:
        engineConfig.provider,

      engine,

      pageId,

      businessName:
        selectedBusiness
          ?.page_name || "",

    };

  } catch (err) {

    console.error(
      "RUN GENERATION ENGINE ERROR:",
      err
    );

    throw err;

  }

}