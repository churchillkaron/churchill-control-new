import crypto from "node:crypto";
import { signCreativeStorageReference } from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import { CreativeSandboxRuntime } from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";
import { CreativeMatchmoveAuthorityRuntime } from "./CreativeMatchmoveAuthorityRuntime";
import { CreativeCinemaEngineCertificationLedgerRuntime } from "@/lib/creative/certification/runtime/CreativeCinemaEngineCertificationLedgerRuntime";

export const CREATIVE_OPENCV_MATCHMOVE_EXECUTION_CONTRACT="CREATIVE_OPENCV_MATCHMOVE_EXECUTION_V1";
const PYTHON="/tmp/avantiqo-opencv/venv/bin/python";
function text(v){return String(v??"").trim();}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0,20);}
function snapshotId(project){return text(project?.metadata?.creative_tool_snapshots?.opencv?.snapshot_id);}
function worker(cfg64){return `
import base64,json,math,urllib.request
import cv2, numpy as np
cfg=json.loads(base64.b64decode("${cfg64}").decode())
urllib.request.urlretrieve(cfg['source_url'],cfg['source_path'])
cap=cv2.VideoCapture(cfg['source_path'])
if not cap.isOpened(): raise RuntimeError('MATCHMOVE_SOURCE_OPEN_FAILED')
fps=float(cap.get(cv2.CAP_PROP_FPS) or 0); w=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0); h=int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
fx=float(cfg.get('fx') or max(w,h)); fy=float(cfg.get('fy') or fx); cx=float(cfg.get('cx') or w/2); cy=float(cfg.get('cy') or h/2)
K=np.array([[fx,0,cx],[0,fy,cy],[0,0,1]],dtype=np.float64)
dist=np.array(cfg.get('distortion') or [0,0,0,0,0],dtype=np.float64)
sample_fps=max(.5,float(cfg.get('sample_fps',6))); step=max(1,int(round(fps/sample_fps))) if fps>0 else 1; max_samples=max(2,int(cfg.get('max_samples',180)))
ok,prev=cap.read();
if not ok: raise RuntimeError('MATCHMOVE_FIRST_FRAME_REQUIRED')
prev=cv2.undistort(prev,K,dist) if np.any(dist) else prev
prev_gray=cv2.cvtColor(prev,cv2.COLOR_BGR2GRAY); pts=cv2.goodFeaturesToTrack(prev_gray,1000,.008,7,blockSize=7)
R_total=np.eye(3); t_total=np.zeros((3,1)); samples=[]; idx=0; count=0; parallax=[]
while count<max_samples:
  target=idx+step; cap.set(cv2.CAP_PROP_POS_FRAMES,target); ok,frame=cap.read()
  if not ok: break
  frame=cv2.undistort(frame,K,dist) if np.any(dist) else frame; gray=cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY)
  if pts is None or len(pts)<30: pts=cv2.goodFeaturesToTrack(prev_gray,1000,.008,7,blockSize=7)
  if pts is None: break
  nxt,status,err=cv2.calcOpticalFlowPyrLK(prev_gray,gray,pts,None,winSize=(31,31),maxLevel=4,criteria=(cv2.TERM_CRITERIA_EPS|cv2.TERM_CRITERIA_COUNT,30,.01))
  if nxt is None or status is None: break
  keep=status.reshape(-1)==1; old=pts.reshape(-1,2)[keep]; new=nxt.reshape(-1,2)[keep]
  if len(old)<12: prev_gray=gray; pts=cv2.goodFeaturesToTrack(gray,1000,.008,7); idx=target; count+=1; continue
  E,mask=cv2.findEssentialMat(old,new,K,method=cv2.RANSAC,prob=.999,threshold=1.5)
  inliers=0; recovered=False; R=np.eye(3); t=np.zeros((3,1))
  if E is not None:
    try:
      inliers,R,t,pose_mask=cv2.recoverPose(E,old,new,K,mask=mask); recovered=inliers>=12
    except Exception: recovered=False
  flow=np.linalg.norm(new-old,axis=1); median_flow=float(np.median(flow)) if len(flow) else 0.0; parallax.append(median_flow)
  if recovered:
    R_total=R@R_total; t_total=t_total+R_total.T@t
  samples.append({'frame':target,'time_seconds':target/fps if fps>0 else None,'tracked_points':int(len(old)),'inliers':int(inliers),'median_flow_pixels':median_flow,'pose_recovered':bool(recovered),'rotation_matrix':R_total.tolist(),'translation_unit':t_total.reshape(-1).tolist()})
  prev_gray=gray; pts=new.reshape(-1,1,2); idx=target; count+=1
cap.release()
valid=[s for s in samples if s['pose_recovered']]
median_parallax=float(np.median(parallax)) if parallax else 0.0
result={'operation':'MATCHMOVE_3D','source':{'fps':fps,'width':w,'height':h},'camera_intrinsics':{'fx':fx,'fy':fy,'cx':cx,'cy':cy},'lens_model':{'type':'BROWN_CONRADY','distortion':dist.tolist()},'samples':samples,'parallax_evidence':{'sufficient':len(valid)>=2 and median_parallax>=1.25,'median_flow_pixels':median_parallax,'valid_pose_samples':len(valid)},'rolling_shutter_model':cfg.get('rolling_shutter_model'),'object_tracks':[]}
with open(cfg['result_path'],'w') as f: json.dump(result,f,separators=(',',':'))
print(json.dumps({'samples':len(samples),'valid_pose_samples':len(valid),'median_parallax':median_parallax}))
`;}
export async function executeOpenCVMatchmove({organization_id,project,source_reference,intrinsics={},distortion=[0,0,0,0,0],sample_fps=6,max_samples=180,rolling_shutter_model=null}={}){
  if(!organization_id||!project?.id)throw new Error("MATCHMOVE_SCOPE_REQUIRED");if(!text(source_reference).startsWith("storage://"))throw new Error("MATCHMOVE_STORAGE_REFERENCE_REQUIRED");const snapshot=snapshotId(project);if(!snapshot)throw new Error("MATCHMOVE_OPENCV_SNAPSHOT_REQUIRED");const sourceUrl=await signCreativeStorageReference({organization_id,reference:source_reference,expires_in:900});const id=hash({organization_id,source_reference,intrinsics,distortion,sample_fps,max_samples});const base=`/tmp/avantiqo-matchmove-${id}`;const cfg={source_url:sourceUrl,source_path:`${base}/source.mp4`,result_path:`${base}/result.json`,fx:intrinsics.fx||null,fy:intrinsics.fy||null,cx:intrinsics.cx||null,cy:intrinsics.cy||null,distortion,sample_fps,max_samples,rolling_shutter_model};const sb=await CreativeSandboxRuntime.fromSnapshot({snapshot_id:snapshot,timeout_ms:420000,network_policy:"allow-all"});try{await CreativeSandboxRuntime.writeText({sandbox:sb,path:`${base}/worker.py`,content:worker(Buffer.from(JSON.stringify(cfg)).toString("base64"))});await CreativeSandboxRuntime.run({sandbox:sb,cmd:PYTHON,args:[`${base}/worker.py`],timeout_ms:360000,error_prefix:"MATCHMOVE_OPENCV_EXECUTION_FAILED"});const buf=await CreativeSandboxRuntime.readBuffer({sandbox:sb,path:cfg.result_path});const result=JSON.parse(buf.toString("utf8"));const authority=CreativeMatchmoveAuthorityRuntime.evaluate({track_result:result,camera_intrinsics:result.camera_intrinsics,lens_model:result.lens_model,parallax_evidence:result.parallax_evidence,rolling_shutter_model:result.rolling_shutter_model,object_tracks:result.object_tracks});if(authority.status==="READY"&&authority.authority?.world_space_cgi_allowed===true){await CreativeCinemaEngineCertificationLedgerRuntime.record({organization_id,creative_project_id:project.id,evidence:{engine_id:"MATCHMOVE_3D",implementation_contracts:[CREATIVE_OPENCV_MATCHMOVE_EXECUTION_CONTRACT,CreativeMatchmoveAuthorityRuntime.contract],technical_proof_passed:true,technical_proof_id:`opencv-matchmove:${id}`,visual_proof_passed:false,proof_checksum:crypto.createHash("sha256").update(buf).digest("hex"),provider_calls_performed:false,notes:"3D camera solve passed matchmove authority with sufficient parallax evidence."}});}return{contract:CREATIVE_OPENCV_MATCHMOVE_EXECUTION_CONTRACT,result,authority,degraded:false,provider_calls_performed:false};}finally{await CreativeSandboxRuntime.stop(sb);}}
export const CreativeOpenCVMatchmoveExecutionRuntime=Object.freeze({contract:CREATIVE_OPENCV_MATCHMOVE_EXECUTION_CONTRACT,execute:executeOpenCVMatchmove});
