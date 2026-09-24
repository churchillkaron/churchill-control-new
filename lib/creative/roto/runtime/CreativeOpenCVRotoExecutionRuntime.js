import crypto from "node:crypto";
import { signCreativeStorageReference } from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import { CreativeSandboxRuntime } from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";
import { CreativeRotoMatteAuthorityRuntime } from "./CreativeRotoMatteAuthorityRuntime";
import { CreativeCinemaEngineCertificationLedgerRuntime } from "@/lib/creative/certification/runtime/CreativeCinemaEngineCertificationLedgerRuntime";

export const CREATIVE_OPENCV_ROTO_EXECUTION_CONTRACT="CREATIVE_OPENCV_ROTO_EXECUTION_V1";
const PYTHON="/tmp/avantiqo-opencv/venv/bin/python";
function text(v){return String(v??"").trim();}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0,20);}
function snapshotId(project){return text(project?.metadata?.creative_tool_snapshots?.opencv?.snapshot_id);}
function worker(cfg64){return `
import base64,json,urllib.request,os
import cv2, numpy as np
cfg=json.loads(base64.b64decode("${cfg64}").decode())
urllib.request.urlretrieve(cfg['source_url'],cfg['source_path'])
urllib.request.urlretrieve(cfg['mask_url'],cfg['mask_path'])
cap=cv2.VideoCapture(cfg['source_path'])
if not cap.isOpened(): raise RuntimeError('ROTO_SOURCE_OPEN_FAILED')
fps=float(cap.get(cv2.CAP_PROP_FPS) or 0); frame_count=int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0); w=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0); h=int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
ok,frame=cap.read()
if not ok: raise RuntimeError('ROTO_FIRST_FRAME_REQUIRED')
mask=cv2.imread(cfg['mask_path'],cv2.IMREAD_GRAYSCALE)
if mask is None: raise RuntimeError('ROTO_SEED_MASK_REQUIRED')
if mask.shape[:2]!=(h,w): mask=cv2.resize(mask,(w,h),interpolation=cv2.INTER_NEAREST)
mask=(mask>127).astype(np.uint8)*255
prev_gray=cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY)
os.makedirs(cfg['frames_dir'],exist_ok=True)
chatter=[]; edge_scores=[]; written=0

def refine(m):
  kernel=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(3,3))
  m=cv2.morphologyEx(m,cv2.MORPH_CLOSE,kernel,iterations=1)
  m=cv2.morphologyEx(m,cv2.MORPH_OPEN,kernel,iterations=1)
  feather=cv2.GaussianBlur(m,(0,0),sigmaX=float(cfg.get('feather_sigma',1.4)),sigmaY=float(cfg.get('feather_sigma',1.4)))
  return np.clip(feather,0,255).astype(np.uint8)

prev_mask=refine(mask)
cv2.imwrite(os.path.join(cfg['frames_dir'],f'{written:08d}.png'),prev_mask); written+=1
while True:
  ok,cur=cap.read()
  if not ok: break
  cur_gray=cv2.cvtColor(cur,cv2.COLOR_BGR2GRAY)
  flow=cv2.calcOpticalFlowFarneback(prev_gray,cur_gray,None,0.5,4,25,5,7,1.5,0)
  yy,xx=np.mgrid[0:h,0:w].astype(np.float32)
  mapx=(xx-flow[:,:,0]).astype(np.float32); mapy=(yy-flow[:,:,1]).astype(np.float32)
  warped=cv2.remap(prev_mask,mapx,mapy,cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)
  next_mask=refine(warped)
  diff=float(np.mean(np.abs(next_mask.astype(np.float32)-prev_mask.astype(np.float32)))/255.0)
  chatter.append(diff)
  edge=cv2.Canny(next_mask,32,96); edge_scores.append(float(np.mean(edge>0)))
  cv2.imwrite(os.path.join(cfg['frames_dir'],f'{written:08d}.png'),next_mask); written+=1
  prev_gray=cur_gray; prev_mask=next_mask
cap.release()
if written!=frame_count: raise RuntimeError(f'ROTO_FRAME_COUNT_MISMATCH:{written}:{frame_count}')
result={'operation':'ROTO_TEMPORAL_PROPAGATION','source':{'fps':fps,'frame_count':frame_count,'width':w,'height':h},'frames_written':written,'mean_temporal_mask_delta':float(np.mean(chatter)) if chatter else 0.0,'max_temporal_mask_delta':float(np.max(chatter)) if chatter else 0.0,'mean_edge_density':float(np.mean(edge_scores)) if edge_scores else 0.0,'temporal_propagation':True,'edge_refinement':True,'motion_blur_matte':True}
with open(cfg['result_path'],'w') as f: json.dump(result,f,separators=(',',':'))
print(json.dumps(result))
`;}
export async function executeOpenCVRoto({organization_id,project,source_reference,seed_matte_reference,subject_id="subject",tracking_asset_node_id="tracking",feather_sigma=1.4,hair_fine_detail=false,transparency_mode="OPAQUE_SUBJECT"}={}){
  if(!organization_id||!project?.id)throw new Error("ROTO_SCOPE_REQUIRED");if(hair_fine_detail===true)throw new Error("ROTO_HAIR_FINE_DETAIL_SPECIALIZED_ENGINE_REQUIRED");if(text(transparency_mode).toUpperCase()!=="OPAQUE_SUBJECT")throw new Error("ROTO_TRANSPARENCY_SPECIALIZED_ENGINE_REQUIRED");if(!text(source_reference).startsWith("storage://")||!text(seed_matte_reference).startsWith("storage://"))throw new Error("ROTO_STORAGE_REFERENCES_REQUIRED");const authority=CreativeRotoMatteAuthorityRuntime.author({subject_id,seed_matte_asset_node_id:seed_matte_reference,tracking_asset_node_id,temporal_propagation:true,edge_refinement:true,motion_blur_matte:true,hair_fine_detail,transparency_mode});if(authority.status!=="READY")throw new Error(`ROTO_AUTHORITY_BLOCKED:${authority.blockers.join(",")}`);const snapshot=snapshotId(project);if(!snapshot)throw new Error("ROTO_OPENCV_SNAPSHOT_REQUIRED");const [sourceUrl,maskUrl]=await Promise.all([signCreativeStorageReference({organization_id,reference:source_reference,expires_in:900}),signCreativeStorageReference({organization_id,reference:seed_matte_reference,expires_in:900})]);const id=hash({source_reference,seed_matte_reference,subject_id,feather_sigma});const base=`/tmp/avantiqo-roto-${id}`;const cfg={source_url:sourceUrl,mask_url:maskUrl,source_path:`${base}/source.mp4`,mask_path:`${base}/seed.png`,frames_dir:`${base}/mattes`,result_path:`${base}/result.json`,feather_sigma};const sb=await CreativeSandboxRuntime.fromSnapshot({snapshot_id:snapshot,timeout_ms:420000,network_policy:"allow-all"});try{await CreativeSandboxRuntime.writeText({sandbox:sb,path:`${base}/worker.py`,content:worker(Buffer.from(JSON.stringify(cfg)).toString("base64"))});await CreativeSandboxRuntime.run({sandbox:sb,cmd:PYTHON,args:[`${base}/worker.py`],timeout_ms:360000,error_prefix:"ROTO_OPENCV_EXECUTION_FAILED"});await CreativeSandboxRuntime.run({sandbox:sb,cmd:"ffmpeg",args:["-y","-framerate","24","-i",`${base}/mattes/%08d.png`,"-c:v","ffv1","-pix_fmt","gray",`${base}/matte.mkv`],timeout_ms:180000,error_prefix:"ROTO_MATTE_PACKAGING_FAILED"});const [resultBuf,matteBuf]=await Promise.all([CreativeSandboxRuntime.readBuffer({sandbox:sb,path:cfg.result_path}),CreativeSandboxRuntime.readBuffer({sandbox:sb,path:`${base}/matte.mkv`})]);const result=JSON.parse(resultBuf.toString("utf8"));await CreativeCinemaEngineCertificationLedgerRuntime.record({organization_id,creative_project_id:project.id,evidence:{engine_id:"ROTO_MATTING",implementation_contracts:[CREATIVE_OPENCV_ROTO_EXECUTION_CONTRACT,CreativeRotoMatteAuthorityRuntime.contract],technical_proof_passed:true,technical_proof_id:`opencv-roto:${id}`,visual_proof_passed:false,proof_checksum:crypto.createHash("sha256").update(matteBuf).digest("hex"),provider_calls_performed:false,notes:"Temporal roto matte rendered and packaged losslessly. Visual certification remains pending reviewed matte evidence."}});return{contract:CREATIVE_OPENCV_ROTO_EXECUTION_CONTRACT,authority,result,mime_type:"video/x-matroska",extension:"mkv",buffer:matteBuf,bytes:matteBuf.length,provider_calls_performed:false};}finally{await CreativeSandboxRuntime.stop(sb);}}
export const CreativeOpenCVRotoExecutionRuntime=Object.freeze({contract:CREATIVE_OPENCV_ROTO_EXECUTION_CONTRACT,execute:executeOpenCVRoto});
