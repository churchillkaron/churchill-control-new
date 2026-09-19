import crypto from "node:crypto";

import {
  CreativeCinematographyAcquisitionRuntime,
} from "@/lib/creative/video/runtime/CreativeCinematographyAcquisitionRuntime";
import {
  CreativeVirtualCameraStateRuntime,
} from "@/lib/creative/quality/runtime/CreativeVirtualCameraStateRuntime";

export const CREATIVE_IMAGE_CAMERA_AUTHORITY_CONTRACT = "CREATIVE_IMAGE_CAMERA_AUTHORITY_V1";

function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
function text(v){return String(v??"").trim();}
function finite(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function stable(v){
  if(Array.isArray(v)) return v.map(stable);
  if(!v||typeof v!=="object") return v;
  return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));
}
function digest(v){return crypto.createHash("sha256").update(JSON.stringify(stable(v))).digest("hex");}
function sensorWidth(sensorFormat){
  const value=text(sensorFormat).toUpperCase();
  if(value==="SUPER_35_EQUIVALENT") return 24.89;
  if(value==="LARGE_FORMAT_EQUIVALENT") return 54.12;
  return 36;
}
function toleranceEqual(a,b,tolerance){
  const left=finite(a),right=finite(b);
  if(left===null||right===null) return false;
  return Math.abs(left-right)<=tolerance;
}

export function buildImageCameraAuthority({shot={},task={}}={}){
  const acquisition=CreativeCinematographyAcquisitionRuntime.assert(
    CreativeCinematographyAcquisitionRuntime.compile({shot,task}),
  );
  if(acquisition.applicability!=="PHYSICAL_VIDEO"){
    return {
      contract:CREATIVE_IMAGE_CAMERA_AUTHORITY_CONTRACT,
      status:"NOT_APPLICABLE",
      authority_hash:null,
      provider_neutral:true,
    };
  }
  const virtual=CreativeVirtualCameraStateRuntime.evaluate(shot);
  if(virtual.passed!==true){
    throw new Error(`IMAGE_CAMERA_VIRTUAL_STATE_BLOCKED:${virtual.failures.join(",")}`);
  }
  const state=object(shot.virtual_camera_state);
  const start=object(state.start);
  const end=object(state.end);
  const focal=finite(acquisition.camera?.focal_length_mm);
  const body={
    contract:CREATIVE_IMAGE_CAMERA_AUTHORITY_CONTRACT,
    status:"SEALED_DIRECTION",
    provider_neutral:true,
    source:"GOVERNED_SHOT_CINEMATOGRAPHY",
    rig_type:acquisition.camera?.rig_type||null,
    sensor_format:acquisition.camera?.sensor_format||null,
    sensor_width_mm:sensorWidth(acquisition.camera?.sensor_format),
    focal_length_mm:focal,
    aperture_t_stop:finite(acquisition.camera?.aperture_t_stop),
    shutter_angle_degrees:finite(acquisition.camera?.shutter_angle),
    depth_of_field:acquisition.camera?.depth_of_field||null,
    subject_lock:acquisition.camera?.subject_lock||null,
    start:{
      focal_length_mm:finite(start.focal_length_mm),
      subject_distance_m:finite(start.subject_distance_m),
      camera_height_m:finite(start.camera_height_m),
      roll_degrees:finite(start.roll_degrees),
    },
    end:{
      focal_length_mm:finite(end.focal_length_mm),
      subject_distance_m:finite(end.subject_distance_m),
      camera_height_m:finite(end.camera_height_m),
      roll_degrees:finite(end.roll_degrees),
    },
    focus_distance_m:finite(start.subject_distance_m),
    focus_behavior:text(state.focus_behavior),
    perspective_intent:text(state.perspective_intent),
    zoom_or_lens_change_declared:state.zoom_or_lens_change_declared===true,
    optical_preservation:{
      perspective_reinterpretation_forbidden:true,
      undeclared_focal_change_forbidden:true,
      arbitrary_wide_angle_conversion_forbidden:true,
      arbitrary_telephoto_conversion_forbidden:true,
      camera_height_reinterpretation_forbidden:true,
      subject_distance_reinterpretation_forbidden:true,
      focus_plane_reinterpretation_forbidden:true,
    },
  };
  return {...body,authority_hash:digest(body)};
}

export function compareImageCameraAuthority({authority={},cinematography_acquisition={},virtual_camera_state={}}={}){
  const failures=[];
  if(text(authority.contract)!==CREATIVE_IMAGE_CAMERA_AUTHORITY_CONTRACT) failures.push("IMAGE_CAMERA_AUTHORITY_CONTRACT_REQUIRED");
  if(text(authority.status)!=="SEALED_DIRECTION") failures.push("IMAGE_CAMERA_AUTHORITY_NOT_SEALED");
  const camera=object(cinematography_acquisition.camera);
  if(!toleranceEqual(authority.focal_length_mm,camera.focal_length_mm,0.5)) failures.push("IMAGE_CAMERA_FOCAL_LENGTH_DRIFT");
  if(!toleranceEqual(authority.aperture_t_stop,camera.aperture_t_stop,0.1)) failures.push("IMAGE_CAMERA_APERTURE_DRIFT");
  if(!toleranceEqual(authority.shutter_angle_degrees,camera.shutter_angle,1)) failures.push("IMAGE_CAMERA_SHUTTER_DRIFT");
  if(text(authority.sensor_format)!==text(camera.sensor_format)) failures.push("IMAGE_CAMERA_SENSOR_FORMAT_DRIFT");
  const state=object(virtual_camera_state);
  const start=object(state.start);
  const end=object(state.end);
  for(const [label,a,b,tol] of [
    ["START_FOCAL",authority.start?.focal_length_mm,start.focal_length_mm,0.5],
    ["END_FOCAL",authority.end?.focal_length_mm,end.focal_length_mm,0.5],
    ["START_DISTANCE",authority.start?.subject_distance_m,start.subject_distance_m,0.05],
    ["END_DISTANCE",authority.end?.subject_distance_m,end.subject_distance_m,0.05],
    ["START_HEIGHT",authority.start?.camera_height_m,start.camera_height_m,0.03],
    ["END_HEIGHT",authority.end?.camera_height_m,end.camera_height_m,0.03],
  ]){
    if(!toleranceEqual(a,b,tol)) failures.push(`IMAGE_CAMERA_${label}_DRIFT`);
  }
  if(authority.zoom_or_lens_change_declared!==(state.zoom_or_lens_change_declared===true)){
    failures.push("IMAGE_CAMERA_LENS_CHANGE_DECLARATION_DRIFT");
  }
  return {
    contract:"CREATIVE_IMAGE_CAMERA_AUTHORITY_COMPARISON_V1",
    passed:failures.length===0,
    failures,
    authority_hash:authority.authority_hash||null,
    zero_provider_calls:true,
  };
}

export const CreativeImageCameraAuthorityRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_CAMERA_AUTHORITY_CONTRACT,
  build:buildImageCameraAuthority,
  compare:compareImageCameraAuthority,
});
