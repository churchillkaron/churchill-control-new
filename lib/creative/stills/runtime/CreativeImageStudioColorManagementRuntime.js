export const CREATIVE_IMAGE_STUDIO_COLOR_MANAGEMENT_CONTRACT="CREATIVE_IMAGE_STUDIO_COLOR_MANAGEMENT_V1";
export const IMAGE_STUDIO_OUTPUT_COLOR_SPACES=Object.freeze(["SRGB"]);

export function normalizeImageStudioOutputColorSpace(value="SRGB"){
  const resolved=String(value||"SRGB").trim().toUpperCase();
  if(!IMAGE_STUDIO_OUTPUT_COLOR_SPACES.includes(resolved))throw new Error(`IMAGE_STUDIO_OUTPUT_COLOR_SPACE_UNSUPPORTED:${resolved||"EMPTY"}`);
  return resolved;
}

export function imageStudioSharpIccProfile(value="SRGB"){
  const resolved=normalizeImageStudioOutputColorSpace(value);
  if(resolved==="SRGB")return "srgb";
  throw new Error(`IMAGE_STUDIO_OUTPUT_COLOR_SPACE_UNSUPPORTED:${resolved}`);
}

export const CreativeImageStudioColorManagementRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_STUDIO_COLOR_MANAGEMENT_CONTRACT,
  output_color_spaces:IMAGE_STUDIO_OUTPUT_COLOR_SPACES,
  normalize:normalizeImageStudioOutputColorSpace,
  sharpProfile:imageStudioSharpIccProfile,
});
export default CreativeImageStudioColorManagementRuntime;
