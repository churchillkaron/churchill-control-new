import crypto from "node:crypto";
import { signCreativeStorageReference } from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import { CreativeSandboxRuntime } from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";
import { CreativeToolSnapshotRuntime } from "@/lib/creative/tools/runtime/CreativeToolSnapshotRuntime";
import { CreativeRotoMatteAuthorityRuntime } from "@/lib/creative/roto/runtime/CreativeRotoMatteAuthorityRuntime";

export const AVANTIQO_OPENCV_ROTO_EXECUTION_CONTRACT="AVANTIQO_OPENCV_ROTO_EXECUTION_V1";
const PYTHON="/tmp/avantiqo-opencv/venv/bin/python";
function text(v){return String(v??"").trim();}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0,20);}
function worker(cfg64){return `
import base64,json,os,subprocess,urllib.request,cv2,numpy as np
cfg=json.loads(base64.b64decode("${cfg64}").decode())
urllib.request.urlretrieve(cfg['source_url'],cfg['source_path']); urllib.request.urlretrieve(cfg['matte_url'],cfg['matte_path'])
cap=cv2.VideoCapture(cfg['source_path'])
if not cap.isOpened(): raise RuntimeError('ROTO_SOURCE_OPEN_FAILED')
fps=float(cap.get(cv2.CAP_PROP_FPS) or 24); width=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0); height=int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
seed=cv2.imread(cfg['matte_path'],cv2.IMREAD_GRAYSCALE)
if seed is None: raise RuntimeError('ROTO_SEED_MATTE_OPEN_FAILED')
seed=cv2.resize(seed,(width,height),interpolation=cv2.INTER_LINEAR); seed=np.clip(seed.astype(np.float32)/255.0,0,1)
os.makedirs(cfg['frames_dir'],exist_ok=True)
ok,prev=cap.read()
if not ok: raise RuntimeError('ROTO_FIRST_FRAME_REQUIRED')
prev_gray=cv2.cvtColor(prev,cv2.COLOR_BGR2GRAY); prev_mask=seed
frame_index=0; chatter=[]; flow_magnitudes=[]
def refine(mask,flow_mag):
    u=np.clip(mask*255,0,255).astype(np.uint8)
    kernel=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(3,3)); u=cv2.morphologyEx(u,cv2.MORPH_CLOSE,kernel,iterations=1); u=cv2.morphologyEx(u,cv2.MORPH_OPEN,kernel,iterations=1)
    sigma=max(.45,min(2.8,.45+flow_mag*.055)); u=cv2.GaussianBlur(u,(0,0),sigmaX=sigma,sigmaY=sigma)
    return np.clip(u.astype(np.float32)/255.0,0,1)
def write_rgba(index,mask):
    rgba=np.empty((height,width,4),dtype=np.uint8); rgba[:,:,:3]=255; rgba[:,:,3]=np.clip(mask*255,0,255).astype(np.uint8); cv2.imwrite(os.path.join(cfg['frames_dir'],f'{index:08d}.png'),rgba)
write_rgba(0,prev_mask)
while True:
    ok,frame=cap.read()
    if not ok: break
    gray=cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY)
    flow=cv2.calcOpticalFlowFarneback(prev_gray,gray,None,.5,5,21,4,7,1.5,cv2.OPTFLOW_FARNEBACK_GAUSSIAN)
    mag=np.sqrt(flow[:,:,0]**2+flow[:,:,1]**2); median_mag=float(np.median(mag)); flow_magnitudes.append(median_mag)
    yy,xx=np.mgrid[0:height,0:width].astype(np.float32); map_x=xx-flow[:,:,0]; map_y=yy-flow[:,:,1]
    propagated=cv2.remap(prev_mask,map_x,map_y,cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)
    refined=refine(propagated,median_mag)
    chatter.append(float(np.mean(np.abs(refined-propagated))))
    frame_index+=1; write_rgba(frame_index,refined); prev_gray=gray; prev_mask=refined
cap.release()
out=cfg['output_path']
cmd=['ffmpeg','-y','-framerate',str(fps),'-i',os.path.join(cfg['frames_dir'],'%08d.png'),'-c:v','prores_ks','-profile:v','4','-pix_fmt','yuva444p10le','-an',out]
p=subprocess.run(cmd,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,text=True)
if p.returncode!=0: raise RuntimeError('ROTO_PRORES_ENCODE_FAILED:'+p.stderr[-1500:])
result={'fps':fps,'width':width,'height':height,'frame_count':frame_index+1,'median_flow_pixels':float(np.median(flow_magnitudes)) if flow_magnitudes else 0.0,'mean_refinement_delta':float(np.mean(chatter)) if chatter else 0.0,'temporal_propagation':True,'edge_refinement':True,'motion_blur_matte':True,'alpha_codec':'PRORES_4444','output_path':out}
with open(cfg['result_path'],'w') as h: json.dump(result,h,separators=(',',':'))
print(json.dumps(result))
`;}
export async function executeOpenCVRoto({organization_id,project,source_reference,seed_matte_reference,authority}={}){
  if(!organization_id||!project?.id||!text(source_reference).startsWith("storage://")||!text(seed_matte_reference).startsWith("storage://"))throw new Error("ROTO_EXECUTION_SCOPE_REQUIRED");if(authority?.contract!==CreativeRotoMatteAuthorityRuntime.contract||authority.status!=="READY")throw new Error("ROTO_AUTHORITY_READY_REQUIRED");if(authority.hair_fine_detail===true)throw new Error("ROTO_HAIR_FINE_DETAIL_SPECIALIZED_ENGINE_REQUIRED");if(authority.transparency_mode!=="OPAQUE_SUBJECT")throw new Error("ROTO_TRANSPARENCY_SPECIALIZED_ENGINE_REQUIRED");const ensured=await CreativeToolSnapshotRuntime.ensure({project,tool_id:"opencv"});const [sourceUrl,matteUrl]=await Promise.all([signCreativeStorageReference({organization_id,reference:source_reference,expires_in:900}),signCreativeStorageReference({organization_id,reference:seed_matte_reference,expires_in:900})]);const id=hash({source_reference,seed_matte_reference,authority_hash:authority.contract_hash});const base=`/tmp/avantiqo-roto-${id}`;const sandbox=await CreativeSandboxRuntime.fromSnapshot({snapshot_id:ensured.snapshot_id,timeout_ms:900000,network_policy:"allow-all"});try{const cfg={source_url:sourceUrl,matte_url:matteUrl,source_path:`${base}/source.mp4`,matte_path:`${base}/seed.png`,frames_dir:`${base}/frames`,output_path:`${base}/matte.mov`,result_path:`${base}/result.json`};await CreativeSandboxRuntime.writeText({sandbox,path:`${base}/worker.py`,content:worker(Buffer.from(JSON.stringify(cfg)).toString("base64"))});await CreativeSandboxRuntime.run({sandbox,cmd:PYTHON,args:[`${base}/worker.py`],timeout_ms:840000,error_prefix:"ROTO_EXECUTION_FAILED"});const [video,resultBuffer]=await Promise.all([CreativeSandboxRuntime.readBuffer({sandbox,path:cfg.output_path}),CreativeSandboxRuntime.readBuffer({sandbox,path:cfg.result_path})]);const result=JSON.parse(resultBuffer.toString("utf8"));return{contract:AVANTIQO_OPENCV_ROTO_EXECUTION_CONTRACT,result,buffer:video,mime_type:"video/quicktime",bytes:video.length,provider_calls_performed:false,qc:{temporal_propagation_passed:result.temporal_propagation===true,edge_refinement_passed:result.edge_refinement===true,motion_blur_matte_passed:result.motion_blur_matte===true,mean_refinement_delta:result.mean_refinement_delta}};}finally{await CreativeSandboxRuntime.stop(sandbox);}}
export const CreativeOpenCVRotoExecutionRuntime=Object.freeze({contract:AVANTIQO_OPENCV_ROTO_EXECUTION_CONTRACT,execute:executeOpenCVRoto});
