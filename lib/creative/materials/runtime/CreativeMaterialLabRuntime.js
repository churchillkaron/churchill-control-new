import crypto from "node:crypto";

export const AVANTIQO_MATERIAL_LAB_CONTRACT="AVANTIQO_MATERIAL_LAB_V1";
export const MATERIAL_CLASSES=Object.freeze({
  AUTOMOTIVE_PAINT:"AUTOMOTIVE_PAINT",
  CARBON_FIBER:"CARBON_FIBER",
  GLASS_OPTICAL:"GLASS_OPTICAL",
  METAL_BRUSHED:"METAL_BRUSHED",
  METAL_POLISHED:"METAL_POLISHED",
  LEATHER:"LEATHER",
  RUBBER:"RUBBER",
  PLASTIC:"PLASTIC",
  FABRIC:"FABRIC",
  CUSTOM_PBR:"CUSTOM_PBR",
});
function text(v,n=1000){return String(v??"").trim().slice(0,n);}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function finite(v,f=0,min=-Infinity,max=Infinity){const n=Number(v);return Math.max(min,Math.min(max,Number.isFinite(n)?n:f));}
function color(v,f=[.18,.18,.18,1]){return Array.isArray(v)&&v.length>=3?[finite(v[0],f[0],0,1),finite(v[1],f[1],0,1),finite(v[2],f[2],0,1),finite(v[3]??1,1,0,1)]:f;}
function stable(v){if(Array.isArray(v))return v.map(stable);if(!v||typeof v!=="object")return v;return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(stable(v))).digest("hex");}
function mapSpec(raw={}){const r=object(raw);return{asset_node_id:text(r.asset_node_id,500)||null,channel:text(r.channel,80).toUpperCase()||null,color_space:text(r.color_space,80).toUpperCase()||"NON_COLOR",uv_set:text(r.uv_set,80)||"UVMap",strength:finite(r.strength,1,0,10),scale:finite(r.scale,1,.0001,10000),rotation_degrees:finite(r.rotation_degrees,0,-3600,3600),offset:Array.isArray(r.offset)?r.offset.slice(0,2).map((x)=>finite(x,0,-100,100)):[0,0]};}
function normalize(raw={},index=0){const r=object(raw);const cls=text(r.material_class||r.class,80).toUpperCase();const measured=object(r.measured_profile);const pbr=object(r.pbr);const micro=object(r.microstructure);return{
  material_id:text(r.material_id||r.id||`material-${index+1}`,200),
  name:text(r.name||cls||`Material ${index+1}`,300),
  material_class:Object.values(MATERIAL_CLASSES).includes(cls)?cls:MATERIAL_CLASSES.CUSTOM_PBR,
  continuity_key:text(r.continuity_key||r.material_id||r.id||`material-${index+1}`,300),
  base_color:color(pbr.base_color||r.base_color),
  metallic:finite(pbr.metallic??r.metallic,0,0,1),
  roughness:finite(pbr.roughness??r.roughness,.35,0,1),
  ior:finite(pbr.ior??r.ior,1.5,1,3),
  transmission:finite(pbr.transmission??r.transmission,0,0,1),
  alpha:finite(pbr.alpha??r.alpha,1,0,1),
  coat_weight:finite(pbr.coat_weight??r.coat_weight,0,0,1),
  coat_roughness:finite(pbr.coat_roughness??r.coat_roughness,.08,0,1),
  anisotropy:finite(pbr.anisotropy??r.anisotropy,0,0,1),
  subsurface_weight:finite(pbr.subsurface_weight??r.subsurface_weight,0,0,1),
  emission_color:color(pbr.emission_color||r.emission_color,[0,0,0,1]),
  emission_strength:finite(pbr.emission_strength??r.emission_strength,0,0,100),
  microstructure:{
    carbon_weave_scale:finite(micro.carbon_weave_scale,0,0,10000),
    metallic_flake_scale:finite(micro.metallic_flake_scale,0,0,10000),
    metallic_flake_density:finite(micro.metallic_flake_density,0,0,1),
    orange_peel:finite(micro.orange_peel,0,0,1),
    micro_scratches:finite(micro.micro_scratches,0,0,1),
    dust:finite(micro.dust,0,0,1),
    fingerprint_oil:finite(micro.fingerprint_oil,0,0,1),
    normal_strength:finite(micro.normal_strength,0,0,10),
    roughness_variation:finite(micro.roughness_variation,0,0,1),
    displacement_mm:finite(micro.displacement_mm,0,0,100),
  },
  measured_profile:{
    source:text(measured.source,200)||null,
    manufacturer:text(measured.manufacturer,200)||null,
    profile_id:text(measured.profile_id,300)||null,
    brdf_model:text(measured.brdf_model,100)||null,
    measured_ior:measured.measured_ior==null?null:finite(measured.measured_ior,1.5,1,3),
    colorimetric_reference:text(measured.colorimetric_reference,300)||null,
    scan_asset_node_id:text(measured.scan_asset_node_id,500)||null,
  },
  texture_maps:list(r.texture_maps).map(mapSpec),
  uv_required:r.uv_required!==false,
  texture_bake_required:r.texture_bake_required===true,
  real_world_scale_m:finite(r.real_world_scale_m,1,.00001,10000),
  notes:text(r.notes,1200),
};}
function blockers(material){const b=[];if(!material.material_id)b.push("MATERIAL_ID_REQUIRED");if(!material.continuity_key)b.push("MATERIAL_CONTINUITY_KEY_REQUIRED");if(material.material_class==="AUTOMOTIVE_PAINT"&&material.coat_weight<=0)b.push(`AUTOMOTIVE_CLEARCOAT_REQUIRED:${material.material_id}`);if(material.material_class==="CARBON_FIBER"&&material.microstructure.carbon_weave_scale<=0)b.push(`CARBON_WEAVE_SCALE_REQUIRED:${material.material_id}`);if(material.material_class==="GLASS_OPTICAL"&&(material.transmission<.5||material.ior<=1))b.push(`OPTICAL_GLASS_TRANSMISSION_IOR_REQUIRED:${material.material_id}`);if(material.measured_profile.scan_asset_node_id&&!material.measured_profile.source)b.push(`MEASURED_PROFILE_SOURCE_REQUIRED:${material.material_id}`);for(const map of material.texture_maps)if(!map.asset_node_id||!map.channel)b.push(`TEXTURE_MAP_BINDING_REQUIRED:${material.material_id}`);return b;}
export function authorMaterialLibrary({materials=[],library_name="Avantiqo Material Library",strict=true}={}){const normalized=list(materials).map(normalize);const blocked=[...new Set(normalized.flatMap(blockers))];const body={contract:AVANTIQO_MATERIAL_LAB_CONTRACT,library_name:text(library_name,300),strict:strict===true,materials:normalized,material_count:normalized.length,policy:{measured_materials_preferred:true,physical_scale_required:true,continuity_identity_required:true,pbr_maps_color_managed:true,generated_texture_without_provenance_forbidden:true,automotive_clearcoat_required:true,optical_glass_ior_required:true}};return{...body,status:strict&&blocked.length?"BLOCKED":"READY",blockers:blocked,library_hash:hash(body)};}
export const CreativeMaterialLabRuntime=Object.freeze({contract:AVANTIQO_MATERIAL_LAB_CONTRACT,classes:MATERIAL_CLASSES,author:authorMaterialLibrary});
