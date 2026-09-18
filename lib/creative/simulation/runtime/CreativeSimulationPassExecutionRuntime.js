import crypto from "node:crypto";

import { CreativeSimulationRuntime } from "./CreativeSimulationRuntime.js";
import { CreativeParticleSimulationRenderRuntime } from "./CreativeParticleSimulationRenderRuntime.js";
import { CreativeRigidBodySimulationRenderRuntime } from "./CreativeRigidBodySimulationRenderRuntime.js";
import { CreativePyroSimulationRenderRuntime } from "./CreativePyroSimulationRenderRuntime.js";
import { CreativeMultiPassArtifactRuntime } from "@/lib/creative/multipass/runtime/CreativeMultiPassArtifactRuntime";

export const CREATIVE_SIMULATION_PASS_EXECUTION_CONTRACT="CREATIVE_SIMULATION_PASS_EXECUTION_V1";
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");}

export async function executeSimulationPass({organization_id,creative_project_id,creative_mission_id=null,project,shot_id,simulation_contract,output_spec={}}={}){
  const verified=CreativeSimulationRuntime.assertReady({simulation_contract});
  const contract=verified.simulation_contract;
  const contractHash=hash(contract);
  const outputs=[];
  for(const simulation of list(contract.simulations)){
    let rendered;
    if(simulation.simulation_class==="PARTICLE_GRANULAR"){
      rendered=await CreativeParticleSimulationRenderRuntime.render({project,simulation,output_spec});
    } else if(["RIGID_BODY","DESTRUCTION_FRACTURE"].includes(simulation.simulation_class)){
      rendered=await CreativeRigidBodySimulationRenderRuntime.render({project,simulation,output_spec});
    } else if(simulation.simulation_class==="PYRO_SMOKE_FIRE"){
      rendered=await CreativePyroSimulationRenderRuntime.render({project,simulation,output_spec});
    } else {
      throw new Error(`SIMULATION_RENDER_BACKEND_UNAVAILABLE:${simulation.simulation_class}`);
    }
    const artifact=await CreativeMultiPassArtifactRuntime.persist({
      organization_id,creative_project_id,creative_mission_id,shot_id,pass_id:"simulation",
      artifact_kind:`SIMULATION_PLATE_${simulation.simulation_id}`,
      buffer:rendered.buffer,mime_type:rendered.mime_type,extension:rendered.file_extension,
      provider_id:"blender",capability:"creative.simulation.particle.render",
      technical:{duration_seconds:rendered.configuration.frames/rendered.configuration.fps,width:rendered.configuration.width,height:rendered.configuration.height,frame_rate:rendered.configuration.fps},
      metadata:{simulation_contract:contract.contract,simulation_contract_hash:contractHash,simulation_id:simulation.simulation_id,simulation_class:simulation.simulation_class,simulation_numeric_profile:simulation.execution_parameters,deterministic_seed:rendered.deterministic_seed,transparent_alpha_required:true,simulation_qc_required:true},
    });
    outputs.push({simulation_id:simulation.simulation_id,artifact,rendered:{contract:rendered.contract,bytes:rendered.bytes,deterministic_seed:rendered.deterministic_seed}});
  }
  return {contract:CREATIVE_SIMULATION_PASS_EXECUTION_CONTRACT,shot_id,simulation_contract_hash:contractHash,outputs,physics_qc_required:true,simulation_qc_seal_required_before_compositing:true,provider_calls_performed:false};
}

export const CreativeSimulationPassExecutionRuntime=Object.freeze({contract:CREATIVE_SIMULATION_PASS_EXECUTION_CONTRACT,execute:executeSimulationPass});
