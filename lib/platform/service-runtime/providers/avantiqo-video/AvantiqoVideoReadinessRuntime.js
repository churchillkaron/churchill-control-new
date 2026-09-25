import { AvantiqoVideoLocalQueueProvider } from "./AvantiqoVideoLocalQueueProvider.js";

export const AVANTIQO_VIDEO_READINESS_CONTRACT = "AVANTIQO_VIDEO_LOCAL_READINESS_V1";
function enabled(value){return ["1","true","yes","on"].includes(String(value??"").trim().toLowerCase());}
export async function getAvantiqoVideoReadiness(){
  const localComputeConfigured=enabled(process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED);
  const localVideoWorkerImplemented=true;
  let localVideoWorkerAvailable=false;
  let availabilityError=null;
  if (localComputeConfigured) {
    try {
      localVideoWorkerAvailable=await AvantiqoVideoLocalQueueProvider.available();
    } catch (error) {
      availabilityError=error?.message || "AVANTIQO_VIDEO_LOCAL_NODE_AVAILABILITY_CHECK_FAILED";
    }
  }
  const ready=localComputeConfigured && localVideoWorkerImplemented && localVideoWorkerAvailable;
  const status=ready
    ?"READY"
    :!localComputeConfigured
      ?"LOCAL_COMPUTE_QUEUE_NOT_CONFIGURED"
      :!localVideoWorkerAvailable
        ?"LOCAL_VIDEO_WORKER_OFFLINE"
        :"LOCAL_VIDEO_WORKER_NOT_IMPLEMENTED";
  return {
    success:ready,
    ready,
    contract:AVANTIQO_VIDEO_READINESS_CONTRACT,
    infrastructure_provider:"AVANTIQO_LOCAL_NODE_V1",
    local_only:true,
    modal_fallback_allowed:false,
    local_compute_configured:localComputeConfigured,
    local_video_worker_implemented:localVideoWorkerImplemented,
    local_video_worker_available:localVideoWorkerAvailable,
    generation_spawned:false,
    paid_inference_performed:false,
    status,
    error:ready?null:availabilityError || (
      status==="LOCAL_COMPUTE_QUEUE_NOT_CONFIGURED"
        ?"AVANTIQO_LOCAL_COMPUTE_QUEUE_NOT_CONFIGURED"
        :"AVANTIQO_VIDEO_LOCAL_NODE_UNAVAILABLE"
    ),
  };
}
export async function inspectAvantiqoVideoRuntimeReadiness(){return getAvantiqoVideoReadiness();}
export const AvantiqoVideoReadinessRuntime=Object.freeze({contract:AVANTIQO_VIDEO_READINESS_CONTRACT,get:getAvantiqoVideoReadiness,inspect:inspectAvantiqoVideoRuntimeReadiness});
export default AvantiqoVideoReadinessRuntime;
