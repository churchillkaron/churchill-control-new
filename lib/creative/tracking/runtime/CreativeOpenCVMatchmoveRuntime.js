import crypto from "node:crypto";
import { signCreativeStorageReference } from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import { CreativeSandboxRuntime } from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";
import { CreativeToolSnapshotRuntime } from "@/lib/creative/tools/runtime/CreativeToolSnapshotRuntime";

export const AVANTIQO_OPENCV_MATCHMOVE_CONTRACT="AVANTIQO_OPENCV_MATCHMOVE_V1";
const PYTHON="/tmp/avantiqo-opencv/venv/bin/python";
function text(v){return String(v??"").trim();}
function finite(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f;}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0,20);}
function worker(cfg64){return `
import base64,json,math,urllib.request,cv2,numpy as np
cfg=json.loads(base64.b64decode("${cfg64}").decode())
urllib.request.urlretrieve(cfg['source_url'],cfg['source_path'])
cap=cv2.VideoCapture(cfg['source_path'])
if not cap.isOpened(): raise RuntimeError('MATCHMOVE_SOURCE_OPEN_FAILED')
fps=float(cap.get(cv2.CAP_PROP_FPS) or 0); width=int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0); height=int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0); frame_count=int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
intr=cfg.get('camera_intrinsics') or {}
fx=float(intr.get('fx') or intr.get('focal_px') or max(width,height)*1.2); fy=float(intr.get('fy') or fx); cx=float(intr.get('cx') or width/2); cy=float(intr.get('cy') or height/2)
K=np.array([[fx,0,cx],[0,fy,cy],[0,0,1]],dtype=np.float64)
dist=np.array(intr.get('dist_coeffs') or [0,0,0,0,0],dtype=np.float64)
calibrated=bool(cfg.get('camera_intrinsics'))
step=max(1,int(round(fps/max(.5,float(cfg.get('sample_fps',6)))))) if fps>0 else 1
max_samples=max(2,min(600,int(cfg.get('max_samples',180))))
ok,prev=cap.read()
if not ok: raise RuntimeError('MATCHMOVE_FIRST_FRAME_REQUIRED')
prev_gray=cv2.cvtColor(prev,cv2.COLOR_BGR2GRAY)
pts=cv2.goodFeaturesToTrack(prev_gray,maxCorners=1400,qualityLevel=.006,minDistance=6,blockSize=7)
calibration_source='CALIBRATED_INPUT' if calibrated else 'UNRESOLVED'
auto_focal_confidence=0.0
if not calibrated and pts is not None:
    target=step; cap.set(cv2.CAP_PROP_POS_FRAMES,target); ok_probe,probe=cap.read()
    if ok_probe:
        probe_gray=cv2.cvtColor(probe,cv2.COLOR_BGR2GRAY)
        nxt,status,err=cv2.calcOpticalFlowPyrLK(prev_gray,probe_gray,pts,None,winSize=(31,31),maxLevel=5,criteria=(cv2.TERM_CRITERIA_EPS|cv2.TERM_CRITERIA_COUNT,40,.005))
        if nxt is not None and status is not None:
            keep=status.reshape(-1)==1; p0=pts.reshape(-1,2)[keep]; p1=nxt.reshape(-1,2)[keep]
            best=None
            for cand in np.linspace(max(width,height)*.65,max(width,height)*2.4,18):
                Kc=np.array([[cand,0,cx],[0,cand,cy],[0,0,1]],dtype=np.float64)
                E,mask=cv2.findEssentialMat(p0,p1,Kc,method=cv2.RANSAC,prob=.999,threshold=1.25)
                score=float(np.mean(mask>0)) if E is not None and mask is not None else 0.0
                if best is None or score>best[0]: best=(score,float(cand))
            if best and best[0]>=.58 and len(p0)>=40:
                auto_focal_confidence=best[0]; fx=best[1]; fy=best[1]
                K=np.array([[fx,0,cx],[0,fy,cy],[0,0,1]],dtype=np.float64)
                calibrated=True; calibration_source='AUTO_FOCAL_SEARCH'
    cap.set(cv2.CAP_PROP_POS_FRAMES,1)
R_world=np.eye(3,dtype=np.float64); t_world=np.zeros((3,1),dtype=np.float64)
poses=[{'frame':0,'time_seconds':0,'R':R_world.tolist(),'t':t_world.reshape(-1).tolist()}]
samples=[]; rolling=[]; current_frame=0
for sample_index in range(max_samples):
    target=current_frame+step; cap.set(cv2.CAP_PROP_POS_FRAMES,target); ok,frame=cap.read()
    if not ok: break
    gray=cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY)
    if pts is None or len(pts)<80: pts=cv2.goodFeaturesToTrack(prev_gray,maxCorners=1400,qualityLevel=.006,minDistance=6,blockSize=7)
    if pts is None: break
    nxt,status,err=cv2.calcOpticalFlowPyrLK(prev_gray,gray,pts,None,winSize=(31,31),maxLevel=5,criteria=(cv2.TERM_CRITERIA_EPS|cv2.TERM_CRITERIA_COUNT,40,.005))
    if nxt is None or status is None: break
    keep=status.reshape(-1)==1; p0=pts.reshape(-1,2)[keep]; p1=nxt.reshape(-1,2)[keep]
    if len(p0)<20:
        prev_gray=gray; pts=cv2.goodFeaturesToTrack(gray,1400,.006,6); current_frame=target; continue
    p0u=cv2.undistortPoints(p0.reshape(-1,1,2),K,dist,P=K).reshape(-1,2); p1u=cv2.undistortPoints(p1.reshape(-1,1,2),K,dist,P=K).reshape(-1,2)
    E,mask=cv2.findEssentialMat(p0u,p1u,K,method=cv2.RANSAC,prob=.999,threshold=1.25)
    pose_inliers=0; R=np.eye(3); t=np.zeros((3,1))
    if E is not None:
        pose_inliers,R,t,pose_mask=cv2.recoverPose(E,p0u,p1u,K)
        R_world=R@R_world; t_world=R@t_world+t; poses.append({'frame':target,'time_seconds':target/fps if fps>0 else None,'R':R_world.tolist(),'t':t_world.reshape(-1).tolist()})
    displacement=np.linalg.norm(p1-p0,axis=1)
    median_parallax=float(np.median(displacement)) if len(displacement) else 0.0
    inlier_ratio=float(pose_inliers/max(1,len(p0)))
    # Rolling-shutter diagnostic: compare median horizontal flow by image row quartiles.
    ys=p0[:,1]; dx=(p1-p0)[:,0]; row_bins=[]
    for lo,hi in ((0,.25),(.25,.5),(.5,.75),(.75,1.0)):
        sel=(ys>=height*lo)&(ys<height*hi); row_bins.append(float(np.median(dx[sel])) if np.any(sel) else 0.0)
    rolling_delta=max(row_bins)-min(row_bins); rolling.append(abs(rolling_delta))
    samples.append({'frame':target,'tracked_points':int(len(p0)),'inliers':int(pose_inliers),'inlier_ratio':inlier_ratio,'median_parallax_pixels':median_parallax,'rolling_shutter_row_delta_pixels':float(rolling_delta)})
    prev_gray=gray; pts=p1.reshape(-1,1,2); current_frame=target
cap.release()
parallaxes=[x['median_parallax_pixels'] for x in samples]; ratios=[x['inlier_ratio'] for x in samples]
median_parallax=float(np.median(parallaxes)) if parallaxes else 0.0; median_ratio=float(np.median(ratios)) if ratios else 0.0; median_rs=float(np.median(rolling)) if rolling else 0.0
sufficient=bool(calibrated and len(poses)>=3 and median_parallax>=2.0 and median_ratio>=.45)
result={'operation':'CAMERA_MATCHMOVE_3D','source':{'fps':fps,'frame_count':frame_count,'width':width,'height':height,'duration_seconds':frame_count/fps if fps>0 else None},'camera_intrinsics':{'fx':fx,'fy':fy,'cx':cx,'cy':cy,'dist_coeffs':dist.tolist(),'calibrated':calibrated,'calibration_source':calibration_source,'auto_focal_confidence':auto_focal_confidence},'lens_model':{'dist_coeffs':dist.tolist(),'source':calibration_source,'pixel_locked_cg_authorized':calibrated},'parallax_evidence':{'median_parallax_pixels':median_parallax,'median_pose_inlier_ratio':median_ratio,'sufficient':sufficient},'rolling_shutter_model':{'detected':median_rs>=1.5,'median_row_delta_pixels':median_rs,'compensation_required':median_rs>=1.5},'camera_poses':poses,'samples':samples,'world_space_cgi_allowed':sufficient}
with open(cfg['result_path'],'w') as f: json.dump(result,f,separators=(',',':'))
print(json.dumps({'poses':len(poses),'samples':len(samples),'world_space_cgi_allowed':sufficient}))
`;}
export async function executeOpenCVMatchmove({organization_id,project,source_reference,camera_intrinsics=null,sample_fps=6,max_samples=180}={}){
  if(!organization_id||!project?.id||!text(source_reference).startsWith("storage://"))throw new Error("MATCHMOVE_SCOPE_REQUIRED");const ensured=await CreativeToolSnapshotRuntime.ensure({project,tool_id:"opencv"});const sourceUrl=await signCreativeStorageReference({organization_id,reference:source_reference,expires_in:900});const id=hash({source_reference,camera_intrinsics,sample_fps,max_samples});const base=`/tmp/avantiqo-matchmove-${id}`;const scriptPath=`${base}/worker.py`;const resultPath=`${base}/result.json`;const sourcePath=`${base}/source.mp4`;const sandbox=await CreativeSandboxRuntime.fromSnapshot({snapshot_id:ensured.snapshot_id,timeout_ms:600000,network_policy:"allow-all"});try{const cfg64=Buffer.from(JSON.stringify({source_url:sourceUrl,source_path:sourcePath,result_path:resultPath,camera_intrinsics,sample_fps:Math.max(.5,finite(sample_fps,6)),max_samples:Math.max(2,Math.min(600,Math.floor(finite(max_samples,180))))})).toString("base64");await CreativeSandboxRuntime.writeText({sandbox,path:scriptPath,content:worker(cfg64)});await CreativeSandboxRuntime.run({sandbox,cmd:PYTHON,args:[scriptPath],timeout_ms:540000,error_prefix:"MATCHMOVE_3D_EXECUTION_FAILED"});const buffer=await CreativeSandboxRuntime.readBuffer({sandbox,path:resultPath});const result=JSON.parse(buffer.toString("utf8"));return{contract:AVANTIQO_OPENCV_MATCHMOVE_CONTRACT,tool_id:"opencv",result,degraded:false,provider_calls_performed:false};}finally{await CreativeSandboxRuntime.stop(sandbox);}}
export const CreativeOpenCVMatchmoveRuntime=Object.freeze({contract:AVANTIQO_OPENCV_MATCHMOVE_CONTRACT,execute:executeOpenCVMatchmove});
