import {
  createRenderContract,
} from "../contracts/RenderContract";

import {
  selectProvider,
} from "../policies/ProviderPolicy";

export async function render(
  production,
  deliverable,
  assets,
) {

  const contract =
    createRenderContract(
      production,
      deliverable,
      assets,
    );

  const provider =
    await selectProvider(
      contract
    );

  return provider.render(
    contract
  );

}
