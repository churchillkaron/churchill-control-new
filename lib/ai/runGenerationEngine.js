import { providerRegistry }
from "@/lib/ai/providerRegistry";

export async function runGenerationEngine({

  engine,

  prompt,

  poster,

}) {

  try {

    const engineConfig =
      providerRegistry[
        engine
      ];

    if (!engineConfig) {

      throw new Error(
        `No provider configured for engine: ${engine}`
      );

    }

    const generation =
      await engineConfig.runner({

        prompt,

        poster,

      });

    return {

      ...generation,

      provider:
        engineConfig.provider,

      engine,

    };

  } catch (err) {

    console.error(
      "RUN GENERATION ENGINE ERROR:",
      err
    );

    throw err;

  }

}