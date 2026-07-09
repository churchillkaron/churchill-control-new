import {
  getProvider,
} from "./ProviderRegistry.js";


const RUNTIME_LOADERS = {


  openai:
    () =>
      import("./openai/OpenAIProvider")
      .then(
        module =>
          module.OpenAIProvider
      ),


  flux:
    () =>
      import("./flux/FluxProvider")
      .then(
        module =>
          module.FluxProvider
      ),


  runway:
    () =>
      import("./runway/RunwayProvider")
      .then(
        module =>
          module.RunwayProvider
      ),


};



export async function loadProviderRuntime(
  providerId
) {


  const provider =
    getProvider(
      providerId
    );


  if (!provider) {

    throw new Error(
      `Unknown provider: ${providerId}`
    );

  }



  if (
    provider.runtimeAvailable === false
  ) {

    throw new Error(
      `Provider runtime unavailable: ${providerId}`
    );

  }



  const loader =
    RUNTIME_LOADERS[
      provider.runtime
    ];



  if (!loader) {

    throw new Error(
      `No runtime loader for ${provider.runtime}`
    );

  }



  return loader();


}



export async function executeProvider({

  provider,

  capability,

  model,

  input = {},

  context = {},

}) {


  const runtime =
    await loadProviderRuntime(
      provider
    );



  if (
    typeof runtime.execute !== "function"
  ) {

    throw new Error(
      `Invalid provider runtime: ${provider}`
    );

  }



  return runtime.execute({

    capability,

    model,

    context,

    ...input,

  });


}



export const ProviderExecutor = {

  executeProvider,

  loadProviderRuntime,

};
