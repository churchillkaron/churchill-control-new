import { normalizeImageStudioEdgeIntegration } from "./CreativeImageStudioEdgeIntegrationRuntime.js";

export const CREATIVE_IMAGE_STUDIO_EDGE_PREVIEW_CONTRACT="CREATIVE_IMAGE_STUDIO_EDGE_PREVIEW_V1";

export function imageStudioEdgePreview({style={},scale=1,has_mask=false,has_frame_mask=false}={}){
  const settings=normalizeImageStudioEdgeIntegration(style);
  const alphaChanges=settings.matte_choke_px!==0||settings.edge_soften_px>0;
  const colorChanges=settings.despill_strength>0||settings.decontaminate_strength>0;
  const active=alphaChanges||colorChanges;
  if(!active)return {preview_supported:false,reason:"EDGE_INTEGRATION_DISABLED",settings,alpha_changes:false,export_only_reasons:[]};
  const exportOnlyReasons=[];
  if(colorChanges)exportOnlyReasons.push("EDGE_COLOR_CLEANUP_EXPORT_ONLY");
  if(alphaChanges&&(has_mask||has_frame_mask))exportOnlyReasons.push("POST_MASK_ALPHA_REQUIRED");
  if(settings.matte_choke_px<0)exportOnlyReasons.push("EDGE_EXPANSION_RGB_PROPAGATION_REQUIRED");
  if(settings.edge_soften_px>0)exportOnlyReasons.push("EDGE_SOFTEN_RGB_PROPAGATION_REQUIRED");
  const previewSupported=settings.matte_choke_px>0&&settings.edge_soften_px===0&&!has_mask&&!has_frame_mask;
  return {
    preview_supported:previewSupported,
    reason:previewSupported?null:(exportOnlyReasons[0]||"EDGE_PIXEL_PIPELINE_EXPORT_ONLY"),
    fidelity:previewSupported?"EXACT_ALPHA_EROSION_CONCEPT":"EXPORT_ONLY",
    settings,
    alpha_changes:alphaChanges,
    color_changes:colorChanges,
    radius:previewSupported?Math.max(.3,settings.matte_choke_px*Math.max(.01,Number(scale)||1)):0,
    export_only_reasons:exportOnlyReasons,
    partial_preview:previewSupported&&exportOnlyReasons.length>0,
  };
}

export const CreativeImageStudioEdgePreviewRuntime=Object.freeze({contract:CREATIVE_IMAGE_STUDIO_EDGE_PREVIEW_CONTRACT,preview:imageStudioEdgePreview});
export default CreativeImageStudioEdgePreviewRuntime;
