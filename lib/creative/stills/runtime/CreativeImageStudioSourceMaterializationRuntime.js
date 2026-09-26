export const CREATIVE_IMAGE_STUDIO_SOURCE_MATERIALIZATION_CONTRACT="CREATIVE_IMAGE_STUDIO_SOURCE_MATERIALIZATION_V1";

async function defaultStorageSigner(args){
  const runtime=await import("../../assets/storage/CreativePrivateStorageRuntime.js");
  return runtime.signCreativeStorageReference(args);
}

export async function resolveImageStudioSourceUrl({organization_id,value,signer=null}={}){
  const source=String(value||"").trim();
  if(/^https?:\/\//i.test(source))return source;
  if(source.startsWith("storage://")){
    if(!organization_id)throw new Error("IMAGE_STUDIO_EXPORT_SOURCE_ORGANIZATION_REQUIRED");
    const resolveSigner=typeof signer==="function"?signer:defaultStorageSigner;
    const signed=await resolveSigner({organization_id,reference:source,expires_in:900});
    if(!/^https?:\/\//i.test(String(signed||"")))throw new Error("IMAGE_STUDIO_EXPORT_SOURCE_SIGNED_URL_REQUIRED");
    return signed;
  }
  throw new Error("IMAGE_STUDIO_EXPORT_SOURCE_URL_UNSUPPORTED");
}

export const CreativeImageStudioSourceMaterializationRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_STUDIO_SOURCE_MATERIALIZATION_CONTRACT,
  resolve:resolveImageStudioSourceUrl,
});
export default CreativeImageStudioSourceMaterializationRuntime;
