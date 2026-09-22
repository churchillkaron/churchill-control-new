import { supabaseAdmin } from "@/lib/shared/supabase/admin";
export const AVANTIQO_SHARED_TRAINER_RESERVATION_GUARD_CONTRACT = "AVANTIQO_SHARED_TRAINER_RESERVATION_GUARD_V3_LOCAL";
export async function assertAvantiqoSharedTrainerReservation(){
  const result=await supabaseAdmin.from("avantiqo_local_compute_nodes").select("id,last_seen_at,enabled,capabilities,metadata").eq("enabled",true).contains("capabilities",["ai.model.train"]).order("last_seen_at",{ascending:false}).limit(4);
  if(result.error) throw result.error;
  const now=Date.now();
  const node=(result.data||[]).find((row)=>{const seen=new Date(row.last_seen_at||0).getTime();return Number.isFinite(seen)&&now-seen<=90000;});
  if(!node){const error=new Error("AVANTIQO_INTELLIGENCE_LOCAL_TRAINER_NODE_REQUIRED");error.code="AVANTIQO_INTELLIGENCE_LOCAL_TRAINER_NODE_REQUIRED";error.status=503;throw error;}
  return {contract:AVANTIQO_SHARED_TRAINER_RESERVATION_GUARD_CONTRACT,provider:"AVANTIQO",infrastructure_provider:"AVANTIQO_LOCAL_NODE_V1",node_id:node.id,reservation_required:false,reservation_external_control_plane_read:false,max_training_workers:1,scale_to_zero:false,exclusive_trainer_execution_enforced_by:"NODE01_TRAINING_LANE",ready:true,modal_fallback_allowed:false};
}
export const AvantiqoSharedTrainerReservationGuard=Object.freeze({contract:AVANTIQO_SHARED_TRAINER_RESERVATION_GUARD_CONTRACT,assertExclusiveTrainerReservation:assertAvantiqoSharedTrainerReservation});
