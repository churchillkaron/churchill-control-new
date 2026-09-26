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

export function restoreImageStudioTextureAlphaAuthority(base,transformed,width,height,channels=4){
  if(channels<4)throw new Error("IMAGE_STUDIO_TEXTURE_ALPHA_CHANNEL_REQUIRED");
  const expected=Math.max(0,Number(width||0)*Number(height||0)*channels);
  if(Number(base?.length)!==expected||Number(transformed?.length)!==expected)throw new Error("IMAGE_STUDIO_TEXTURE_ALPHA_BUFFER_SIZE_MISMATCH");
  const out=Buffer.from(transformed);
  let transparentPixelCount=0;
  for(let i=0;i<expected;i+=channels){
    const alpha=base[i+3];
    out[i+3]=alpha;
    if(alpha===0){
      out[i]=base[i];out[i+1]=base[i+1];out[i+2]=base[i+2];
      transparentPixelCount+=1;
    }
  }
  return {bytes:out,width,height,channels,transparent_pixel_count:transparentPixelCount,alpha_preserved:true};
}

export const CreativeImageStudioTextureIntegrationRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_STUDIO_TEXTURE_INTEGRATION_CONTRACT,
  normalize:normalizeImageStudioTextureIntegration,
  buildGrainTile:buildImageStudioGrainTile,
  restoreAlphaAuthority:restoreImageStudioTextureAlphaAuthority,
});
export default CreativeImageStudioTextureIntegrationRuntime;
