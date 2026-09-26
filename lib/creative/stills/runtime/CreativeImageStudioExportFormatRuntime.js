export const CREATIVE_IMAGE_STUDIO_EXPORT_FORMAT_CONTRACT="CREATIVE_IMAGE_STUDIO_EXPORT_FORMAT_V1";
export const IMAGE_STUDIO_EXPORT_FORMATS=Object.freeze(["PNG","JPEG","PDF"]);

export function normalizeImageStudioExportFormat(value="PNG"){
  const resolved=String(value||"PNG").trim().toUpperCase();
  if(!IMAGE_STUDIO_EXPORT_FORMATS.includes(resolved))throw new Error(`IMAGE_STUDIO_EXPORT_FORMAT_UNSUPPORTED:${resolved||"EMPTY"}`);
  return resolved;
}

export const CreativeImageStudioExportFormatRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_STUDIO_EXPORT_FORMAT_CONTRACT,
  formats:IMAGE_STUDIO_EXPORT_FORMATS,
  normalize:normalizeImageStudioExportFormat,
});
export default CreativeImageStudioExportFormatRuntime;
