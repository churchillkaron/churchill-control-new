import toggleLegalEntity from "../capabilities/toggleLegalEntity";

export async function toggleLegalEntityCommand(input) {
  return await toggleLegalEntity(input);
}
