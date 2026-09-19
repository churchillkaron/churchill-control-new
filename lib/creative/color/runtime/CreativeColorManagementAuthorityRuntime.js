import crypto from "node:crypto";

export const AVANTIQO_COLOR_MANAGEMENT_AUTHORITY_CONTRACT="AVANTIQO_COLOR_MANAGEMENT_AUTHORITY_V1";
const INPUTS=Object.freeze({
  REC709:Object.freeze({id:"REC709",primaries:"BT709",transfer:"BT709",scene_linear:false,input_transform:"REC709_TO_SCENE_LINEAR"}),
  SRGB:Object.freeze({id:"SRGB",primaries:"BT709",transfer:"SRGB",scene_linear:false,input_transform:"SRGB_TO_SCENE_LINEAR"}),
  ARRI_LOGC3:Object.freeze({id:"ARRI_LOGC3",primaries:"ALEXA_WIDE_GAMUT",transfer:"LOGC3",scene_linear:false,input_transform:"ARRI_LOGC3_AWG_TO_SCENE_LINEAR"}),
  ARRI_LOGC4:Object.freeze({id:"ARRI_LOGC4",primaries:"ARRI_WIDE_GAMUT4",transfer:"LOGC4",scene_linear:false,input_transform:"ARRI_LOGC4_AWG4_TO_SCENE_LINEAR"}),
  SONY_SLOG3_SGAMUT3CINE:Object.freeze({id:"SONY_SLOG3_SGAMUT3CINE",primaries:"SGAMUT3CINE",transfer:"SLOG3",scene_linear:false,input_transform:"SONY_SLOG3_SGAMUT3CINE_TO_SCENE_LINEAR"}),
  RED_LOG3G10_RWGRGB:Object.freeze({id:"RED_LOG3G10_RWGRGB",primaries:"REDWIDEGAMUTRGB",transfer:"LOG3G10",scene_linear:false,input_transform:"RED_LOG3G10_RWGRGB_TO_SCENE_LINEAR"}),
  ACESCG:Object.freeze({id:"ACESCG",primaries:"AP1",transfer:"LINEAR",scene_linear:true,input_transform:"IDENTITY"}),
  LINEAR_SRGB:Object.freeze({id:"LINEAR_SRGB",primaries:"BT709",transfer:"LINEAR",scene_linear:true,input_transform:"LINEAR_SRGB_TO_SCENE_LINEAR"}),
});
const OUTPUTS=Object.freeze({
  REC709_SDR:Object.freeze({id:"REC709_SDR",primaries:"BT709",transfer:"BT1886",bit_depth:10,hdr:false,output_transform:"SCENE_LINEAR_TO_REC709"}),
  REC2020_PQ:Object.freeze({id:"REC2020_PQ",primaries:"BT2020",transfer:"PQ",bit_depth:10,hdr:true,output_transform:"OCIO_OR_ACES_REQUIRED"}),
  REC2020_HLG:Object.freeze({id:"REC2020_HLG",primaries:"BT2020",transfer:"HLG",bit_depth:10,hdr:true,output_transform:"OCIO_OR_ACES_REQUIRED"}),
  P3_D65:Object.freeze({id:"P3_D65",primaries:"P3_D65",transfer:"GAMMA_2_6",bit_depth:12,hdr:false,cinema:true,output_transform:"OCIO_OR_ACES_REQUIRED"}),
});
function text(v){return String(v??"").trim();}
function stable(v){if(Array.isArray(v))return v.map(stable);if(!v||typeof v!=="object")return v;return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(stable(v))).digest("hex");}
export function resolveColorManagement({input_profile="REC709",output_target="REC709_SDR",ocio_config_id=null,creative_look_id=null}={}){
  const input=INPUTS[text(input_profile).toUpperCase()]||null;const output=OUTPUTS[text(output_target).toUpperCase()]||null;const blockers=[];
  if(!input)blockers.push(`COLOR_INPUT_PROFILE_UNSUPPORTED:${text(input_profile)}`);
  if(!output)blockers.push(`COLOR_OUTPUT_TARGET_UNSUPPORTED:${text(output_target)}`);
  if(output?.hdr&&!text(ocio_config_id))blockers.push(`COLOR_HDR_OCIO_ACES_CONFIG_REQUIRED:${output.id}`);
  if(output?.cinema&&!text(ocio_config_id))blockers.push(`COLOR_CINEMA_OCIO_ACES_CONFIG_REQUIRED:${output.id}`);
  const body={contract:AVANTIQO_COLOR_MANAGEMENT_AUTHORITY_CONTRACT,input,working_space:{id:"AVANTIQO_SCENE_LINEAR",scene_referred:true,linear:true,grading_before_display_transform:true},creative_look:{look_id:text(creative_look_id)||null,authority:"GLOBAL_COLOR_DI_ONLY"},output,ocio_config_id:text(ocio_config_id)||null,policy:{single_final_color_authority:true,pre_di_colorbalance_forbidden:true,pre_di_contrast_saturation_grade_forbidden:true,shot_level_color_metadata_is_intent_not_render_authority:true,vfx_compositing_scene_linear_required:true,hdr_requires_verified_ocio_or_aces:true}};
  return{...body,status:blockers.length?"BLOCKED":"READY",blockers,color_pipeline_hash:hash(body)};
}
export const CreativeColorManagementAuthorityRuntime=Object.freeze({contract:AVANTIQO_COLOR_MANAGEMENT_AUTHORITY_CONTRACT,input_profiles:INPUTS,output_targets:OUTPUTS,resolve:resolveColorManagement});
