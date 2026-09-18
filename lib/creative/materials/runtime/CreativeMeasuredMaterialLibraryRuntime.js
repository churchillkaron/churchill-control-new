import crypto from "node:crypto";

export const AVANTIQO_MEASURED_MATERIAL_LIBRARY_CONTRACT="AVANTIQO_MEASURED_MATERIAL_LIBRARY_V1";
const PRESETS=Object.freeze({
  AUTOMOTIVE_METALLIC_CLEARCOAT:Object.freeze({profile_id:"AUTOMOTIVE_METALLIC_CLEARCOAT",source:"AVANTIQO_PHYSICAL_REFERENCE",brdf_model:"PRINCIPLED_LAYERED_CLEARCOAT",measured_ior:1.52,defaults:{metallic:.78,roughness:.18,coat_weight:1,coat_roughness:.055,anisotropy:.08},microstructure:{metallic_flake_scale:130,metallic_flake_density:.6,orange_peel:.1,micro_scratches:.04,normal_strength:.12}}),
  CARBON_FIBER_2X2_TWILL:Object.freeze({profile_id:"CARBON_FIBER_2X2_TWILL",source:"AVANTIQO_PHYSICAL_REFERENCE",brdf_model:"ANISOTROPIC_COATED_COMPOSITE",measured_ior:1.5,defaults:{metallic:.16,roughness:.2,coat_weight:.9,coat_roughness:.065,anisotropy:.62},microstructure:{carbon_weave_scale:36,micro_scratches:.025,normal_strength:.22,roughness_variation:.045}}),
  OPTICAL_HEADLAMP_GLASS:Object.freeze({profile_id:"OPTICAL_HEADLAMP_GLASS",source:"AVANTIQO_PHYSICAL_REFERENCE",brdf_model:"DIELECTRIC_TRANSMISSIVE",measured_ior:1.52,defaults:{metallic:0,roughness:.025,transmission:.98,coat_weight:.08,coat_roughness:.02},microstructure:{micro_scratches:.018,dust:.01,normal_strength:.035}}),
});
function text(v){return String(v??"").trim();}
function stable(v){if(Array.isArray(v))return v.map(stable);if(!v||typeof v!=="object")return v;return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(stable(v))).digest("hex");}
export function resolveMeasuredMaterialProfile({profile_id,manufacturer=null,scan_asset_node_id=null,colorimetric_reference=null}={}){const preset=PRESETS[text(profile_id).toUpperCase()]||null;if(!preset)throw new Error(`MEASURED_MATERIAL_PROFILE_UNSUPPORTED:${text(profile_id)}`);const body={contract:AVANTIQO_MEASURED_MATERIAL_LIBRARY_CONTRACT,...preset,manufacturer:text(manufacturer)||null,scan_asset_node_id:text(scan_asset_node_id)||null,colorimetric_reference:text(colorimetric_reference)||null,provenance:{profile_origin:preset.source,user_scan_bound:Boolean(text(scan_asset_node_id)),manufacturer_bound:Boolean(text(manufacturer))}};return{...body,profile_hash:hash(body)};}
export const CreativeMeasuredMaterialLibraryRuntime=Object.freeze({contract:AVANTIQO_MEASURED_MATERIAL_LIBRARY_CONTRACT,presets:PRESETS,resolve:resolveMeasuredMaterialProfile});
