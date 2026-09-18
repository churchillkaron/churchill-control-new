import crypto from "node:crypto";

import { signCreativeStorageReference } from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import { CreativeSandboxRuntime } from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";

export const CREATIVE_VFX_INTEGRATION_RENDER_CONTRACT = "CREATIVE_VFX_INTEGRATION_RENDER_V1";

function text(v){return String(v??"").trim();}
function finite(v,f){const n=Number(v);return Number.isFinite(n)?n:f;}
function integer(v,f,min=1,max=10000){return Math.min(max,Math.max(min,Math.round(finite(v,f))));}
function snapshotId(project={}){return text(project?.metadata?.creative_tool_snapshots?.opencv?.snapshot_id);}
function digest(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");}

function normalize(effect={}, outputSpec={}){
  const p=effect.integration_parameters||{};
  if(text(p.contract)!=="AVANTIQO_VFX_INTEGRATION_NUMERIC_PROFILE_V1") throw new Error("VFX_INTEGRATION_NUMERIC_PROFILE_REQUIRED");
  const rule=text(p.depth_foreground_rule);
  if(!["GREATER_THAN_EFFECT_DEPTH_OCCLUDES","LESS_THAN_EFFECT_DEPTH_OCCLUDES"].includes(rule)) throw new Error("VFX_DEPTH_FOREGROUND_RULE_INVALID");
  return {
    effect_id:text(effect.effect_id),
    width:integer(outputSpec.width,1920,320,4096),
    height:integer(outputSpec.height,1080,180,2160),
    fps:integer(outputSpec.frame_rate||outputSpec.fps,24,12,120),
    duration_seconds:Math.max(0.2,finite(outputSpec.duration_seconds,3)),
    seed:integer(p.seed,52000,1,2147483646),
    depth_position_normalized:finite(p.depth_position_normalized,0.5),
    depth_foreground_rule:rule,
    occlusion_softness_pixels:finite(p.occlusion_softness_pixels,6),
    matte_erode_pixels:integer(p.matte_erode_pixels,1,0,32),
    matte_feather_pixels:finite(p.matte_feather_pixels,2.5),
    exposure_ev:finite(p.exposure_ev,0),
    saturation:finite(p.saturation,1),
    black_level:finite(p.black_level,0),
    white_level:finite(p.white_level,1),
    motion_blur_pixels:finite(p.motion_blur_pixels,3),
    motion_blur_angle_degrees:finite(p.motion_blur_angle_degrees,0),
    dof_blur_sigma:finite(p.dof_blur_sigma,0.8),
    grain_strength:finite(p.grain_strength,0.018),
    light_wrap_pixels:finite(p.light_wrap_pixels,4),
    light_wrap_strength:finite(p.light_wrap_strength,0.25),
  };
}

function worker(encoded){return `
import base64,json,math,os,random,subprocess,urllib.request
import cv2
import numpy as np
cfg=json.loads(base64.b64decode("${encoded}").decode("utf-8"))
os.makedirs(cfg['work'],exist_ok=True)
def dl(url,path): urllib.request.urlretrieve(url,path)
dl(cfg['effect_url'],cfg['effect_mov'])
dl(cfg['base_url'],cfg['base_mov'])
dl(cfg['depth_url'],cfg['depth_png'])
subprocess.run(['ffmpeg','-y','-i',cfg['effect_mov'],os.path.join(cfg['effect_dir'],'%06d.png')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
subprocess.run(['ffmpeg','-y','-i',cfg['base_mov'],os.path.join(cfg['base_dir'],'%06d.png')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
depth=cv2.imread(cfg['depth_png'],cv2.IMREAD_UNCHANGED)
if depth is None: raise RuntimeError('VFX_DEPTH_OPEN_FAILED')
if depth.ndim==3: depth=cv2.cvtColor(depth,cv2.COLOR_BGR2GRAY)
depth=depth.astype(np.float32)
lo=float(np.percentile(depth,1)); hi=float(np.percentile(depth,99)); span=max(1e-6,hi-lo)
depth=np.clip((depth-lo)/span,0,1)
depth=cv2.resize(depth,(cfg['width'],cfg['height']),interpolation=cv2.INTER_CUBIC)
threshold=float(cfg['depth_position_normalized'])
if cfg['depth_foreground_rule']=='GREATER_THAN_EFFECT_DEPTH_OCCLUDES': occ=(depth>threshold).astype(np.float32)
else: occ=(depth<threshold).astype(np.float32)
soft=max(0.0,float(cfg['occlusion_softness_pixels']))
if soft>0: occ=cv2.GaussianBlur(occ,(0,0),soft)
visibility=np.clip(1.0-occ,0,1)
random.seed(cfg['seed']); np.random.seed(cfg['seed']%(2**32-1))
frames=sorted([f for f in os.listdir(cfg['effect_dir']) if f.endswith('.png')])
if not frames: raise RuntimeError('VFX_EFFECT_FRAMES_REQUIRED')
for name in frames:
    ep=os.path.join(cfg['effect_dir'],name); bp=os.path.join(cfg['base_dir'],name)
    effect=cv2.imread(ep,cv2.IMREAD_UNCHANGED)
    if effect is None: continue
    if effect.ndim==2: effect=cv2.cvtColor(effect,cv2.COLOR_GRAY2BGRA)
    if effect.shape[2]==3: effect=np.dstack([effect,np.full(effect.shape[:2],255,np.uint8)])
    effect=cv2.resize(effect,(cfg['width'],cfg['height']),interpolation=cv2.INTER_CUBIC)
    rgba=effect.astype(np.float32)/255.0
    rgb=rgba[:,:,:3]; alpha=rgba[:,:,3]
    # authored color/exposure match
    gain=2.0**float(cfg['exposure_ev'])
    rgb=np.clip((rgb*gain+float(cfg['black_level']))*float(cfg['white_level']),0,1)
    gray=cv2.cvtColor((rgb*255).astype(np.uint8),cv2.COLOR_BGR2GRAY).astype(np.float32)/255.0
    sat=float(cfg['saturation']); rgb=np.clip(gray[:,:,None]*(1-sat)+rgb*sat,0,1)
    # DOF and motion blur stay bounded and deterministic
    sigma=float(cfg['dof_blur_sigma'])
    if sigma>0: rgb=cv2.GaussianBlur(rgb,(0,0),sigma)
    mb=int(round(float(cfg['motion_blur_pixels'])))
    if mb>1:
        k=max(2,mb); kernel=np.zeros((k,k),np.float32)
        angle=math.radians(float(cfg['motion_blur_angle_degrees']))
        cx=(k-1)/2; cy=(k-1)/2
        for t in np.linspace(-cx,cx,k):
            x=int(round(cx+t*math.cos(angle))); y=int(round(cy+t*math.sin(angle)))
            if 0<=x<k and 0<=y<k: kernel[y,x]=1
        kernel/=max(1e-6,kernel.sum()); rgb=cv2.filter2D(rgb,-1,kernel); alpha=cv2.filter2D(alpha,-1,kernel)
    # depth occlusion and matte cleanup
    alpha=np.clip(alpha*visibility,0,1)
    erode=int(cfg['matte_erode_pixels'])
    if erode>0:
        alpha=cv2.erode((alpha*255).astype(np.uint8),np.ones((erode*2+1,erode*2+1),np.uint8)).astype(np.float32)/255.0
    feather=float(cfg['matte_feather_pixels'])
    if feather>0: alpha=cv2.GaussianBlur(alpha,(0,0),feather)
    # source-derived light wrap
    base=cv2.imread(bp,cv2.IMREAD_COLOR)
    if base is not None:
        base=cv2.resize(base,(cfg['width'],cfg['height']),interpolation=cv2.INTER_CUBIC).astype(np.float32)/255.0
        wrap=cv2.GaussianBlur(base,(0,0),max(0.1,float(cfg['light_wrap_pixels'])))
        edge=np.clip(cv2.GaussianBlur(alpha,(0,0),max(0.1,float(cfg['light_wrap_pixels'])))-alpha,0,1)
        rgb=np.clip(rgb+wrap*edge[:,:,None]*float(cfg['light_wrap_strength']),0,1)
    # deterministic grain on visible effect only
    gs=float(cfg['grain_strength'])
    if gs>0:
        noise=np.random.normal(0,gs,(cfg['height'],cfg['width'],1)).astype(np.float32)
        rgb=np.clip(rgb+noise*alpha[:,:,None],0,1)
    out=np.dstack([(rgb*255).astype(np.uint8),(np.clip(alpha,0,1)*255).astype(np.uint8)])
    cv2.imwrite(os.path.join(cfg['out_dir'],name),out)
subprocess.run(['ffmpeg','-y','-framerate',str(cfg['fps']),'-i',os.path.join(cfg['out_dir'],'%06d.png'),'-c:v','qtrle','-pix_fmt','argb',cfg['output_mov']],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
print(json.dumps({'contract':'${CREATIVE_VFX_INTEGRATION_RENDER_CONTRACT}','effect_id':cfg['effect_id'],'frame_count':len(frames),'fps':cfg['fps'],'depth_rule':cfg['depth_foreground_rule'],'depth_position_normalized':threshold},separators=(',',':')))
`;}

export async function renderVfxIntegration({organization_id,project,effect,base_reference,effect_reference,depth_reference,output_spec={}}={}){
  const snapshot=snapshotId(project); if(!snapshot) throw new Error("VFX_INTEGRATION_OPENCV_SNAPSHOT_REQUIRED");
  for(const ref of [base_reference,effect_reference,depth_reference]) if(!text(ref).startsWith("storage://")) throw new Error("VFX_INTEGRATION_STORAGE_REFERENCE_REQUIRED");
  const [baseUrl,effectUrl,depthUrl]=await Promise.all([
    signCreativeStorageReference({organization_id,reference:base_reference,expires_in:1800}),
    signCreativeStorageReference({organization_id,reference:effect_reference,expires_in:1800}),
    signCreativeStorageReference({organization_id,reference:depth_reference,expires_in:1800}),
  ]);
  const cfg=normalize(effect,output_spec); const id=digest({...cfg,base_reference,effect_reference,depth_reference}).slice(0,20);
  const work=`/tmp/avantiqo-vfx-integration-${id}`;
  const full={...cfg,base_url:baseUrl,effect_url:effectUrl,depth_url:depthUrl,work,effect_mov:`${work}/effect.mov`,base_mov:`${work}/base.mp4`,depth_png:`${work}/depth.png`,effect_dir:`${work}/effect`,base_dir:`${work}/base`,out_dir:`${work}/out`,output_mov:`${work}/integrated.mov`};
  const encoded=Buffer.from(JSON.stringify(full),"utf8").toString("base64");
  const sandbox=await CreativeSandboxRuntime.fromSnapshot({snapshot_id:snapshot,timeout_ms:900000,network_policy:"allow-all"});
  try{
    await CreativeSandboxRuntime.run({sandbox,cmd:"bash",args:["-lc",`mkdir -p ${full.effect_dir} ${full.base_dir} ${full.out_dir}`],error_prefix:"VFX_INTEGRATION_PREP_FAILED"});
    await CreativeSandboxRuntime.writeText({sandbox,path:`${work}/worker.py`,content:worker(encoded)});
    const execution=await CreativeSandboxRuntime.run({sandbox,cmd:"python3",args:[`${work}/worker.py`],error_prefix:"VFX_INTEGRATION_RENDER_FAILED"});
    const buffer=await CreativeSandboxRuntime.readBuffer({sandbox,path:full.output_mov});
    let metadata=null; try{metadata=execution.stdout.split("\n").map(x=>x.trim()).filter(Boolean).reverse().map(x=>{try{return JSON.parse(x)}catch{return null}}).find(Boolean)||null}catch{}
    return {contract:CREATIVE_VFX_INTEGRATION_RENDER_CONTRACT,effect_id:cfg.effect_id,mime_type:"video/quicktime",file_extension:"mov",buffer,bytes:buffer.length,configuration:cfg,metadata,transparent_alpha_required:true,provider_calls_performed:false};
  }finally{await CreativeSandboxRuntime.stop(sandbox)}
}

export const CreativeVfxIntegrationRenderRuntime=Object.freeze({contract:CREATIVE_VFX_INTEGRATION_RENDER_CONTRACT,render:renderVfxIntegration});
