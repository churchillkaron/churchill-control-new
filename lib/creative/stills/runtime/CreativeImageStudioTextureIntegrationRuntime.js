import { buildImageStudioGrainPixels, normalizeImageStudioTextureIntegration } from "./CreativeImageStudioTextureCoreRuntime.js";

export const CREATIVE_IMAGE_STUDIO_TEXTURE_INTEGRATION_CONTRACT="CREATIVE_IMAGE_STUDIO_TEXTURE_INTEGRATION_V1";
export { normalizeImageStudioTextureIntegration };

export function buildImageStudioGrainTile(style={},size=1024){
  const grain=buildImageStudioGrainPixels(style,size);
  return {
    bytes:Buffer.from(grain.pixels),
    width:grain.width,
    height:grain.height,
    channels:grain.channels,
    settings:grain.settings,
  };
}

export const CreativeImageStudioTextureIntegrationRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_STUDIO_TEXTURE_INTEGRATION_CONTRACT,
  normalize:normalizeImageStudioTextureIntegration,
  buildGrainTile:buildImageStudioGrainTile,
});
export default CreativeImageStudioTextureIntegrationRuntime;
