import { CreativeSandboxRuntime } from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";

export const CREATIVE_BLENDER_SEQUENCE_PACKAGING_CONTRACT="CREATIVE_BLENDER_SEQUENCE_PACKAGING_V1";
function text(v){return String(v??"").trim();}
export async function packageBlenderRgbaSequence({sandbox,frame_pattern,fps=24,output_path}={}){
  if(!sandbox||!text(frame_pattern)||!text(output_path))throw new Error("BLENDER_SEQUENCE_PACKAGING_SCOPE_REQUIRED");
  await CreativeSandboxRuntime.run({
    sandbox,
    cmd:"ffmpeg",
    args:["-y","-framerate",String(fps),"-start_number","1","-i",frame_pattern,"-c:v","prores_ks","-profile:v","4","-pix_fmt","yuva444p10le","-vendor","apl0","-movflags","+faststart",output_path],
    error_prefix:"BLENDER_SEQUENCE_PRORES4444_PACKAGING_FAILED",
  });
  return{contract:CREATIVE_BLENDER_SEQUENCE_PACKAGING_CONTRACT,output_path,codec:"prores_4444",pixel_format:"yuva444p10le",has_alpha:true};
}
export const CreativeBlenderSequencePackagingRuntime=Object.freeze({contract:CREATIVE_BLENDER_SEQUENCE_PACKAGING_CONTRACT,package:packageBlenderRgbaSequence});
