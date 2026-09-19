import crypto from "node:crypto";
import { CreativeSandboxRuntime } from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";

export const CREATIVE_PYRO_SIMULATION_RENDER_CONTRACT="CREATIVE_PYRO_SIMULATION_RENDER_V1";
function text(v){return String(v??"").trim();}
function finite(v,f){const n=Number(v);return Number.isFinite(n)?n:f;}
function integer(v,f,min=1,max=10000){return Math.min(max,Math.max(min,Math.round(finite(v,f))));}
function snapshotId(project={}){return text(project?.metadata?.creative_tool_snapshots?.blender?.snapshot_id);}
function digest(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");}
function normalize(simulation={},spec={}){
  if(text(simulation.simulation_class).toUpperCase()!=="PYRO_SMOKE_FIRE") throw new Error("PYRO_SIMULATION_CLASS_REQUIRED");
  const p=simulation.execution_parameters||{};if(text(p.contract)!=="AVANTIQO_PYRO_SIMULATION_NUMERIC_PROFILE_V1") throw new Error("PYRO_SIMULATION_NUMERIC_PROFILE_REQUIRED");
  const fps=integer(spec.frame_rate||spec.fps||p.frame_rate,p.frame_rate||24,12,60);const duration=Math.max(.4,finite(spec.duration_seconds??p.duration_seconds,p.duration_seconds||4));
  return {simulation_id:text(simulation.simulation_id),width:integer(spec.width,1920,320,4096),height:integer(spec.height,1080,180,2160),fps,frames:integer(Math.ceil(duration*fps),96,4,1200),...p};
}
function script(encoded,outputPath){return `
import base64,json,math,os
import bpy
from mathutils import Vector
cfg=json.loads(base64.b64decode("${encoded}").decode("utf-8"))
out=${JSON.stringify(outputPath)}
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
engine_items={item.identifier for item in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items}
scene.render.engine='BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engine_items else ('BLENDER_EEVEE' if 'BLENDER_EEVEE' in engine_items else 'CYCLES');scene.render.resolution_x=int(cfg['width']);scene.render.resolution_y=int(cfg['height']);scene.render.resolution_percentage=100
scene.render.fps=int(cfg['fps']);scene.frame_start=1;scene.frame_end=int(cfg['frames']);scene.render.film_transparent=True
scene.render.image_settings.file_format='FFMPEG';scene.render.image_settings.color_mode='RGBA';scene.render.ffmpeg.format='QUICKTIME';scene.render.ffmpeg.codec='QTRLE';scene.render.ffmpeg.constant_rate_factor='PERC_LOSSLESS';scene.render.filepath=out
scene.view_settings.look='AgX - Medium High Contrast'
world=bpy.data.worlds.new('World');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Strength'].default_value=0.0

# Camera / lighting only reveal the volume; background remains transparent.
cd=bpy.data.cameras.new('Camera');cam=bpy.data.objects.new('Camera',cd);scene.collection.objects.link(cam);scene.camera=cam;cam.location=(0,-5.8,1.4);cd.lens=60;direction=Vector((0,0,1.0))-cam.location;cam.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
ld=bpy.data.lights.new('PyroKey','AREA');lo=bpy.data.objects.new('PyroKey',ld);scene.collection.objects.link(lo);lo.location=(-2,-2,3.5);ld.energy=500;ld.size=2.5

# Emitter
pos=cfg.get('emitter_position',[0,0,0]);scale=cfg.get('emitter_scale',[.18,.18,.08])
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3,radius=1.0,location=pos);em=bpy.context.object;em.name='PyroEmitter';em.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
flow=em.modifiers.new('Pyro Flow','FLUID');flow.fluid_type='FLOW';scene.frame_set(1);bpy.context.view_layer.objects.active=em;em.select_set(True);bpy.context.view_layer.update()
fs=flow.flow_settings
if fs is None: raise RuntimeError('PYRO_FLOW_SETTINGS_UNAVAILABLE')
mode=str(cfg.get('flame_smoke','FIRE_AND_SMOKE'))
fs.flow_type='BOTH' if mode=='FIRE_AND_SMOKE' else ('FIRE' if mode=='FIRE' else 'SMOKE')
fs.flow_behavior='INFLOW';fs.surface_distance=1.5
if hasattr(fs,'density'): fs.density=float(cfg['density'])
if hasattr(fs,'fuel_amount'): fs.fuel_amount=float(cfg['fuel'])
if hasattr(fs,'temperature'): fs.temperature=float(cfg['temperature'])
if hasattr(fs,'use_plane_init'): fs.use_plane_init=False
if hasattr(fs,'use_flow'):
    start=int(cfg['emission_start_frame']);end=min(int(cfg['emission_end_frame']),int(cfg['frames']))
    fs.use_flow=False;fs.keyframe_insert(data_path='use_flow',frame=max(1,start-1));fs.use_flow=True;fs.keyframe_insert(data_path='use_flow',frame=start);fs.use_flow=False;fs.keyframe_insert(data_path='use_flow',frame=end+1)

# Gas domain
dscale=cfg.get('domain_scale',[1,1,1.8]);center=(pos[0],pos[1],pos[2]+float(dscale[2])*.45)
bpy.ops.mesh.primitive_cube_add(size=2,location=center);domain=bpy.context.object;domain.name='PyroDomain';domain.scale=dscale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
mod=domain.modifiers.new('Pyro Domain','FLUID');mod.fluid_type='DOMAIN';bpy.context.view_layer.objects.active=domain;domain.select_set(True);bpy.context.view_layer.update()
ds=mod.domain_settings
if ds is None: raise RuntimeError('PYRO_DOMAIN_SETTINGS_UNAVAILABLE')
ds.domain_type='GAS';ds.resolution_max=int(cfg['domain_resolution']);ds.time_scale=float(cfg['time_scale']);ds.vorticity=float(cfg['vorticity']);ds.buoyancy_density=float(cfg['buoyancy_density']);ds.buoyancy_heat=float(cfg['buoyancy_heat']);ds.cache_frame_start=1;ds.cache_frame_end=int(cfg['frames']);ds.cache_type='MODULAR';ds.cache_data_format='OPENVDB';ds.cache_directory=os.path.join(os.path.dirname(out),'pyro-cache')
if hasattr(ds,'use_adaptive_domain'): ds.use_adaptive_domain=bool(cfg['adaptive_domain'])
if hasattr(ds,'use_dissolve_smoke'): ds.use_dissolve_smoke=True
if hasattr(ds,'dissolve_speed'): ds.dissolve_speed=int(cfg['dissolve_speed'])
if hasattr(ds,'use_noise'): ds.use_noise=True
if hasattr(ds,'noise_scale'): ds.noise_scale=int(cfg['noise_upres_factor'])

# Volume material uses simulation density/flame fields.
mat=bpy.data.materials.new('PyroVolume');mat.use_nodes=True;nodes=mat.node_tree.nodes;links=mat.node_tree.links
for n in list(nodes): nodes.remove(n)
outn=nodes.new('ShaderNodeOutputMaterial');vol=nodes.new('ShaderNodeVolumePrincipled')
if 'Density' in vol.inputs: vol.inputs['Density'].default_value=1.0
if 'Density Attribute' in vol.inputs: vol.inputs['Density Attribute'].default_value='density'
if 'Blackbody Intensity' in vol.inputs: vol.inputs['Blackbody Intensity'].default_value=1.0 if mode!='SMOKE' else 0.0
if 'Temperature Attribute' in vol.inputs: vol.inputs['Temperature Attribute'].default_value='temperature'
if 'Color' in vol.inputs and mode=='SMOKE': vol.inputs['Color'].default_value=(.16,.17,.18,1)
links.new(vol.outputs['Volume'],outn.inputs['Volume']);domain.data.materials.append(mat)

# Bake deterministic simulation cache.
scene.frame_set(1);bpy.context.view_layer.objects.active=domain
for obj in bpy.context.selected_objects: obj.select_set(False)
domain.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(out),'pyro.blend'))
try:
    bpy.ops.fluid.bake_data()
except Exception as exc:
    raise RuntimeError('PYRO_DATA_BAKE_FAILED:'+str(exc))
if getattr(ds,'use_noise',False):
    try: bpy.ops.fluid.bake_noise()
    except Exception as exc: raise RuntimeError('PYRO_NOISE_BAKE_FAILED:'+str(exc))
scene.render.filepath=out;bpy.ops.render.render(animation=True)
print(json.dumps({'contract':'${CREATIVE_PYRO_SIMULATION_RENDER_CONTRACT}','simulation_id':cfg['simulation_id'],'frames':cfg['frames'],'fps':cfg['fps'],'domain_resolution':cfg['domain_resolution'],'output_path':out},separators=(',',':')))
`;}
export async function renderPyroSimulation({project,simulation,output_spec={}}={}){
  const snapshot=snapshotId(project);if(!snapshot) throw new Error("PYRO_SIMULATION_BLENDER_SNAPSHOT_REQUIRED");const cfg=normalize(simulation,output_spec);const id=digest(cfg).slice(0,20);const base=`/tmp/avantiqo-pyro-simulation-${id}`;const scriptPath=`${base}/simulation.py`;const outputPath=`${base}/pyro-plate.mov`;const encoded=Buffer.from(JSON.stringify(cfg),"utf8").toString("base64");const sandbox=await CreativeSandboxRuntime.fromSnapshot({snapshot_id:snapshot,timeout_ms:1800000,network_policy:"deny-all"});
  try{await CreativeSandboxRuntime.writeText({sandbox,path:scriptPath,content:script(encoded,outputPath)});const execution=await CreativeSandboxRuntime.run({sandbox,cmd:"blender",args:["--background","--python",scriptPath],error_prefix:"CREATIVE_PYRO_SIMULATION_RENDER_FAILED"});const buffer=await CreativeSandboxRuntime.readBuffer({sandbox,path:outputPath});let metadata=null;try{metadata=execution.stdout.split("\n").map(x=>x.trim()).filter(Boolean).reverse().map(x=>{try{return JSON.parse(x)}catch{return null}}).find(Boolean)||null}catch{}return{contract:CREATIVE_PYRO_SIMULATION_RENDER_CONTRACT,simulation_id:cfg.simulation_id,mime_type:"video/quicktime",file_extension:"mov",buffer,bytes:buffer.length,configuration:cfg,metadata,transparent_alpha_required:true,deterministic_seed:cfg.seed,provider_calls_performed:false};}finally{await CreativeSandboxRuntime.stop(sandbox)}
}
export const CreativePyroSimulationRenderRuntime=Object.freeze({contract:CREATIVE_PYRO_SIMULATION_RENDER_CONTRACT,render:renderPyroSimulation,supported_classes:["PYRO_SMOKE_FIRE"]});
