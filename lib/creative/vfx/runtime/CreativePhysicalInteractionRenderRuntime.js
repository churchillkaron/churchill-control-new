import crypto from "node:crypto";
import { signCreativeStorageReference } from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import { CreativeSandboxRuntime } from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";

export const CREATIVE_PHYSICAL_INTERACTION_RENDER_CONTRACT="CREATIVE_PHYSICAL_INTERACTION_RENDER_V1";
function text(v){return String(v??"").trim();}
function finite(v,f){const n=Number(v);return Number.isFinite(n)?n:f;}
function integer(v,f,min=1,max=10000){return Math.min(max,Math.max(min,Math.round(finite(v,f))));}
function snapshotId(project={}){return text(project?.metadata?.creative_tool_snapshots?.opencv?.snapshot_id);}
function digest(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");}
function normalize(effect={},spec={}){const p=effect.integration_parameters||{};if(text(p.contract)!=="AVANTIQO_VFX_INTEGRATION_NUMERIC_PROFILE_V1") throw new Error("PHYSICAL_INTERACTION_PROFILE_REQUIRED");return{effect_id:text(effect.effect_id),width:integer(spec.width,1920,320,4096),height:integer(spec.height,1080,180,2160),fps:integer(spec.frame_rate||spec.fps,24,12,120),duration_seconds:Math.max(.2,finite(spec.duration_seconds,3)),seed:integer(p.seed,52000,1,2147483646),light_wrap_pixels:finite(p.light_wrap_pixels,4),light_wrap_strength:finite(p.light_wrap_strength,.25),reflection_strength:finite(p.reflection_strength,.18),contact_shadow_strength:finite(p.contact_shadow_strength,.35),contact_shadow_blur_pixels:finite(p.contact_shadow_blur_pixels,8)};}
function worker(encoded){return `
import base64,json,os,subprocess,urllib.request
import cv2
import numpy as np
cfg=json.loads(base64.b64decode("${encoded}").decode("utf-8"))
os.makedirs(cfg['vfx_dir'],exist_ok=True);os.makedirs(cfg['light_dir'],exist_ok=True);os.makedirs(cfg['rs_dir'],exist_ok=True)
urllib.request.urlretrieve(cfg['vfx_url'],cfg['vfx_mov'])
subprocess.run(['ffmpeg','-y','-i',cfg['vfx_mov'],os.path.join(cfg['vfx_dir'],'%06d.png')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
materials=cfg.get('materials') or {}
regions=materials.get('regions') or []
reflective=np.zeros((cfg['height'],cfg['width']),np.float32)
shadow_recv=np.zeros_like(reflective)
for r in regions:
    bbox=r.get('approximate_bbox_normalized') or []
    if len(bbox)!=4: continue
    x,y,w,h=[float(v) for v in bbox]
    x0=max(0,min(cfg['width']-1,int(round(x*cfg['width']))));y0=max(0,min(cfg['height']-1,int(round(y*cfg['height']))))
    x1=max(x0+1,min(cfg['width'],int(round((x+w)*cfg['width']))));y1=max(y0+1,min(cfg['height'],int(round((y+h)*cfg['height']))))
    if r.get('reflective') is True: reflective[y0:y1,x0:x1]=max(.15,float(r.get('confidence') or .5))
    if r.get('shadow_receiver') is True: shadow_recv[y0:y1,x0:x1]=max(.2,float(r.get('confidence') or .5))
if not np.any(shadow_recv): shadow_recv[:,:]=1.0
frames=sorted([f for f in os.listdir(cfg['vfx_dir']) if f.endswith('.png')])
for name in frames:
    img=cv2.imread(os.path.join(cfg['vfx_dir'],name),cv2.IMREAD_UNCHANGED)
    if img is None: continue
    if img.shape[2]==3: img=np.dstack([img,np.full(img.shape[:2],255,np.uint8)])
    img=cv2.resize(img,(cfg['width'],cfg['height']),interpolation=cv2.INTER_CUBIC)
    rgb=img[:,:,:3].astype(np.float32)/255.; a=img[:,:,3].astype(np.float32)/255.
    # Lighting interaction: blurred effect energy only, additive-ready transparent plate.
    blur=max(.1,float(cfg['light_wrap_pixels']))
    lum=cv2.cvtColor((rgb*255).astype(np.uint8),cv2.COLOR_BGR2GRAY).astype(np.float32)/255.
    energy=cv2.GaussianBlur(lum*a,(0,0),blur*2.0)
    lr=np.clip(cv2.GaussianBlur(rgb*a[:,:,None],(0,0),blur*2.0)*float(cfg['light_wrap_strength']),0,1)
    la=np.clip(energy*float(cfg['light_wrap_strength']),0,1)
    light=np.dstack([(lr*255).astype(np.uint8),(la*255).astype(np.uint8)])
    cv2.imwrite(os.path.join(cfg['light_dir'],name),light)
    # Contact shadow from source alpha, shifted slightly down and blurred; only valid receiver areas.
    shadow=cv2.GaussianBlur(a,(0,0),max(.1,float(cfg['contact_shadow_blur_pixels'])))
    shift=max(1,int(round(float(cfg['contact_shadow_blur_pixels'])*.45)))
    shadow=np.roll(shadow,shift,axis=0)*shadow_recv*float(cfg['contact_shadow_strength'])
    # Reflection is vertically mirrored effect, heavily blurred/faded and restricted to reflective material regions.
    refl_rgb=np.flipud(rgb); refl_a=np.flipud(a)
    refl_rgb=cv2.GaussianBlur(refl_rgb,(0,0),max(.5,float(cfg['contact_shadow_blur_pixels'])*.7))
    refl_a=cv2.GaussianBlur(refl_a,(0,0),max(.5,float(cfg['contact_shadow_blur_pixels'])*.7))*reflective*float(cfg['reflection_strength'])
    out_rgb=np.clip(refl_rgb*refl_a[:,:,None],0,1)
    total_a=np.clip(np.maximum(refl_a,shadow),0,1)
    # Encode shadow as dark transparent contribution and reflection as colored contribution.
    dark=(1.0-np.clip(shadow[:,:,None],0,1))*out_rgb
    rs=np.dstack([(np.clip(dark,0,1)*255).astype(np.uint8),(total_a*255).astype(np.uint8)])
    cv2.imwrite(os.path.join(cfg['rs_dir'],name),rs)
subprocess.run(['ffmpeg','-y','-framerate',str(cfg['fps']),'-i',os.path.join(cfg['light_dir'],'%06d.png'),'-c:v','qtrle','-pix_fmt','argb',cfg['light_mov']],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
subprocess.run(['ffmpeg','-y','-framerate',str(cfg['fps']),'-i',os.path.join(cfg['rs_dir'],'%06d.png'),'-c:v','qtrle','-pix_fmt','argb',cfg['rs_mov']],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
print(json.dumps({'contract':'${CREATIVE_PHYSICAL_INTERACTION_RENDER_CONTRACT}','effect_id':cfg['effect_id'],'frames':len(frames),'reflective_region_count':sum(1 for r in regions if r.get('reflective') is True),'shadow_receiver_count':sum(1 for r in regions if r.get('shadow_receiver') is True)},separators=(',',':')))
`;}
export async function renderPhysicalInteraction({organization_id,project,effect,vfx_reference,material_map,output_spec={}}={}){
  const snapshot=snapshotId(project);if(!snapshot) throw new Error("PHYSICAL_INTERACTION_OPENCV_SNAPSHOT_REQUIRED");if(!text(vfx_reference).startsWith("storage://")) throw new Error("PHYSICAL_INTERACTION_VFX_STORAGE_REFERENCE_REQUIRED");
  const url=await signCreativeStorageReference({organization_id,reference:vfx_reference,expires_in:1800});const cfg=normalize(effect,output_spec);const id=digest({...cfg,vfx_reference,material_map}).slice(0,20);const work=`/tmp/avantiqo-physical-interaction-${id}`;
  const full={...cfg,vfx_url:url,materials:material_map||{},work,vfx_mov:`${work}/vfx.mov`,vfx_dir:`${work}/vfx`,light_dir:`${work}/light`,rs_dir:`${work}/rs`,light_mov:`${work}/lighting.mov`,rs_mov:`${work}/reflection-shadow.mov`};const encoded=Buffer.from(JSON.stringify(full),"utf8").toString("base64");
  const sandbox=await CreativeSandboxRuntime.fromSnapshot({snapshot_id:snapshot,timeout_ms:900000,network_policy:"allow-all"});
  try{await CreativeSandboxRuntime.run({sandbox,cmd:"bash",args:["-lc",`mkdir -p ${full.vfx_dir} ${full.light_dir} ${full.rs_dir}`],error_prefix:"PHYSICAL_INTERACTION_PREP_FAILED"});await CreativeSandboxRuntime.writeText({sandbox,path:`${work}/worker.py`,content:worker(encoded)});const exec=await CreativeSandboxRuntime.run({sandbox,cmd:"python3",args:[`${work}/worker.py`],error_prefix:"PHYSICAL_INTERACTION_RENDER_FAILED"});const [lighting,reflectionShadow]=await Promise.all([CreativeSandboxRuntime.readBuffer({sandbox,path:full.light_mov}),CreativeSandboxRuntime.readBuffer({sandbox,path:full.rs_mov})]);let metadata=null;try{metadata=exec.stdout.split("\n").map(x=>x.trim()).filter(Boolean).reverse().map(x=>{try{return JSON.parse(x)}catch{return null}}).find(Boolean)||null}catch{}return{contract:CREATIVE_PHYSICAL_INTERACTION_RENDER_CONTRACT,effect_id:cfg.effect_id,lighting:{role:"LIGHTING_INTERACTION",buffer:lighting,mime_type:"video/quicktime",extension:"mov",bytes:lighting.length},reflection_shadow:{role:"REFLECTION_SHADOW",buffer:reflectionShadow,mime_type:"video/quicktime",extension:"mov",bytes:reflectionShadow.length},configuration:cfg,metadata,provider_calls_performed:false};}finally{await CreativeSandboxRuntime.stop(sandbox)}
}
export const CreativePhysicalInteractionRenderRuntime=Object.freeze({contract:CREATIVE_PHYSICAL_INTERACTION_RENDER_CONTRACT,render:renderPhysicalInteraction});
