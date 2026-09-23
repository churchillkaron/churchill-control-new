export const AVANTIQO_VIDEO_READINESS_CONTRACT = "AVANTIQO_VIDEO_LOCAL_READINESS_V1";
function enabled(value){return ["1","true","yes","on"].includes(String(value??"").trim().toLowerCase());}
export async function getAvantiqoVideoReadiness(){
  const localComputeConfigured=enabled(process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED);
  const localVideoWorkerImplemented=false;
  const ready=localComputeConfigured && localVideoWorkerImplemented;
  return {
    success:ready,
    ready,
    contract:AVANTIQO_VIDEO_READINESS_CONTRACT,
    infrastructure_provider:"AVANTIQO_LOCAL_NODE_V1",
    local_only:true,
    modal_fallback_allowed:false,
    local_compute_configured:localComputeConfigured,
    local_video_worker_implemented:localVideoWorkerImplemented,
    generation_spawned:false,
    paid_inference_performed:false,
    status:ready?"READY":localComputeConfigured?"LOCAL_VIDEO_WORKER_NOT_IMPLEMENTED":"LOCAL_COMPUTE_QUEUE_NOT_CONFIGURED",
    error:ready?null:localComputeConfigured?"AVANTIQO_VIDEO_LOCAL_ENGINE_NOT_IMPLEMENTED":"AVANTIQO_LOCAL_COMPUTE_QUEUE_NOT_CONFIGURED",
  };
}
export async function inspectAvantiqoVideoRuntimeReadiness(){return getAvantiqoVideoReadiness();}
export const AvantiqoVideoReadinessRuntime=Object.freeze({contract:AVANTIQO_VIDEO_READINESS_CONTRACT,get:getAvantiqoVideoReadiness,inspect:inspectAvantiqoVideoRuntimeReadiness});
export default AvantiqoVideoReadinessRuntime;
