import crypto from "node:crypto";

import { CreativeSandboxRuntime } from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";
import { CreativeMultiPassArtifactRuntime } from "@/lib/creative/multipass/runtime/CreativeMultiPassArtifactRuntime";

export const CREATIVE_ATMOSPHERE_PASS_EXECUTION_CONTRACT = "CREATIVE_ATMOSPHERE_PASS_EXECUTION_V1";

function text(v){return String(v??"").trim();}
function finite(v,f){const n=Number(v);return Number.isFinite(n)?n:f;}
function integer(v,f,min=1,max=10000){return Math.min(max,Math.max(min,Math.round(finite(v,f))));}
function digest(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");}
function snapshotId(project={}){return text(project?.metadata?.creative_tool_snapshots?.opencv?.snapshot_id);}

function intensity(value="",fallback=0.4){
  const s=text(value).toLowerCase();
  if(/torrential|violent|extreme|heavy|dense/.test(s)) return 0.85;
  if(/moderate|steady|medium/.test(s)) return 0.55;
  if(/light|thin|sparse|drizzle/.test(s)) return 0.28;
  return fallback;
}
function normalize(state={},outputSpec={}){
  return {
    width:integer(outputSpec.width,1920,320,4096),
    height:integer(outputSpec.height,1080,180,2160),
    fps:integer(outputSpec.frame_rate||outputSpec.fps,24,12,120),
    duration_seconds:Math.max(0.2,finite(outputSpec.duration_seconds,3)),
    rain_intensity:intensity(state.precipitation_state,0.45),
    fog_density:intensity(state.atmosphere_density,0.35),
    wind_direction:text(state.wind_direction)||"left-to-right",
    lightning_state:text(state.lightning_state)||"none",
    seed:integer(state.seed,771231,1,2147483646),
  };
}
function worker(encoded){return `
import base64,json,os,random,subprocess
import cv2
import numpy as np
cfg=json.loads(base64.b64decode("${encoded}").decode("utf-8"))
os.makedirs(cfg['out_dir'],exist_ok=True)
random.seed(cfg['seed']); np.random.seed(cfg['seed']%(2**32-1))
frames=max(1,int(round(cfg['fps']*cfg['duration_seconds'])))
w,h=cfg['width'],cfg['height']
rain=float(cfg['rain_intensity']); fog=float(cfg['fog_density'])
wind=cfg['wind_direction'].lower()
dx=1
if 'right-to-left' in wind or 'west' in wind: dx=-1
base_rng=np.random.RandomState(cfg['seed'])
low=base_rng.rand(max(2,h//64),max(2,w//64)).astype(np.float32)
rain_rng=np.random.RandomState(cfg['seed']+17)
count=int(70+rain*420)
particles=[(rain_rng.uniform(-w*0.1,w*1.1),rain_rng.uniform(-h,h),rain_rng.uniform(0.8,1.6)*h,int(rain_rng.uniform(8,28)*(0.5+rain))) for _ in range(count)]
for i in range(frames):
    frame=np.zeros((h,w,4),dtype=np.uint8)
    phase=i/max(1,frames-1)
    shifted=np.roll(low,int(round(phase*dx*2)),axis=1)
    field=cv2.resize(shifted,(w,h),interpolation=cv2.INTER_CUBIC)
    field=cv2.GaussianBlur(field,(0,0),18)
    alpha=np.clip((field*0.55+0.25)*fog,0,0.72)
    frame[:,:,:3]=235
    frame[:,:,3]=(alpha*255).astype(np.uint8)
    for x0,y0,speed,length in particles:
        x=int((x0 + dx*phase*w*0.06) % max(1,w))
        y=int((y0 + phase*speed) % max(1,h))
        a=int(50+rain*120)
        cv2.line(frame,(x,y),(x-dx*max(1,length//4),max(0,y-length)),(245,245,250,a),1,cv2.LINE_AA)
    cv2.imwrite(os.path.join(cfg['out_dir'],f"{i+1:06d}.png"),frame)
subprocess.run(['ffmpeg','-y','-framerate',str(cfg['fps']),'-i',os.path.join(cfg['out_dir'],'%06d.png'),'-c:v','qtrle','-pix_fmt','argb',cfg['output_mov']],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
print(json.dumps({'frames':frames,'fps':cfg['fps'],'rain_intensity':rain,'fog_density':fog},separators=(',',':')))
`;}

export async function executeAtmospherePass({organization_id,creative_project_id,creative_mission_id=null,project,shot_id,environmental_continuity_state={},output_spec={}}={}){
  const snapshot=snapshotId(project);
  if(!snapshot) throw new Error("ATMOSPHERE_OPENCV_SNAPSHOT_REQUIRED");
  const cfg=normalize(environmental_continuity_state,output_spec);
  const id=digest({shot_id,cfg}).slice(0,20);
  const work="/tmp/avantiqo-atmosphere-"+id;
  const full={...cfg,work,out_dir:work+"/out",output_mov:work+"/atmosphere.mov"};
  const encoded=Buffer.from(JSON.stringify(full),"utf8").toString("base64");
  const sandbox=await CreativeSandboxRuntime.fromSnapshot({snapshot_id:snapshot,timeout_ms:900000,network_policy:"allow-all"});
  try{
    await CreativeSandboxRuntime.run({sandbox,cmd:"bash",args:["-lc","mkdir -p "+full.out_dir],error_prefix:"ATMOSPHERE_PREP_FAILED"});
    await CreativeSandboxRuntime.writeText({sandbox,path:work+"/worker.py",content:worker(encoded)});
    const execution=await CreativeSandboxRuntime.run({sandbox,cmd:"python3",args:[work+"/worker.py"],error_prefix:"ATMOSPHERE_RENDER_FAILED"});
    const buffer=await CreativeSandboxRuntime.readBuffer({sandbox,path:full.output_mov});
    const artifact=await CreativeMultiPassArtifactRuntime.persist({
      organization_id,creative_project_id,creative_mission_id,shot_id,
      pass_id:"atmosphere",artifact_kind:"ATMOSPHERE_LAYER",
      buffer,mime_type:"video/quicktime",extension:"mov",provider_id:"opencv",
      capability:"creative.vfx.atmosphere",
      technical:{width:cfg.width,height:cfg.height,frame_rate:cfg.fps,duration_seconds:cfg.duration_seconds},
      metadata:{
        atmosphere_execution_contract:CREATIVE_ATMOSPHERE_PASS_EXECUTION_CONTRACT,
        atmosphere_state:environmental_continuity_state,
        vfx_qc_required:true,
        transparent_alpha_required:true,
      },
    });
    return {contract:CREATIVE_ATMOSPHERE_PASS_EXECUTION_CONTRACT,shot_id,artifact,execution_metadata:execution.stdout,provider_calls_performed:false};
  }finally{
    await CreativeSandboxRuntime.stop(sandbox);
  }
}
export const CreativeAtmospherePassExecutionRuntime=Object.freeze({contract:CREATIVE_ATMOSPHERE_PASS_EXECUTION_CONTRACT,execute:executeAtmospherePass});
