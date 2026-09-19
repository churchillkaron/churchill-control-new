import crypto from "node:crypto";
import { CreativeSandboxRuntime } from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";

export const CREATIVE_SOFT_BODY_SIMULATION_RENDER_CONTRACT="CREATIVE_SOFT_BODY_SIMULATION_RENDER_V1";
function text(v){return String(v??"").trim();}
function finite(v,f){const n=Number(v);return Number.isFinite(n)?n:f;}
function integer(v,f,min=1,max=10000){return Math.min(max,Math.max(min,Math.round(finite(v,f))));}
function snapshotId(project={}){return text(project?.metadata?.creative_tool_snapshots?.blender?.snapshot_id);}
function digest(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");}
function normalize(simulation={},spec={}){
  if(text(simulation.simulation_class).toUpperCase()!=="DEFORMABLE_SOFT_BODY") throw new Error("SOFT_BODY_SIMULATION_CLASS_REQUIRED");
  const p=simulation.execution_parameters||{};if(text(p.contract)!=="AVANTIQO_SOFT_BODY_SIMULATION_NUMERIC_PROFILE_V1") throw new Error("SOFT_BODY_SIMULATION_NUMERIC_PROFILE_REQUIRED");
  const fps=integer(spec.frame_rate||spec.fps||p.frame_rate,p.frame_rate||24,12,60);const duration=Math.max(.4,finite(spec.duration_seconds??p.duration_seconds,p.duration_seconds||4));
  return {simulation_id:text(simulation.simulation_id),width:integer(spec.width,1920,320,4096),height:integer(spec.height,1080,180,2160),fps,frames:integer(Math.ceil(duration*fps),96,4,1200),...p};
}
function script(encoded,out){return `
import base64,json,math,os
import bpy
from mathutils import Vector
cfg=json.loads(base64.b64decode("${encoded}").decode("utf-8"))
out=${JSON.stringify(out)}
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;engine_items={item.identifier for item in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items}
scene.render.engine='BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engine_items else ('BLENDER_EEVEE' if 'BLENDER_EEVEE' in engine_items else 'CYCLES');scene.render.resolution_x=int(cfg['width']);scene.render.resolution_y=int(cfg['height']);scene.render.resolution_percentage=100;scene.render.fps=int(cfg['fps']);scene.frame_start=1;scene.frame_end=int(cfg['frames']);scene.render.film_transparent=True
scene.render.image_settings.file_format='FFMPEG';scene.render.image_settings.color_mode='RGBA';scene.render.ffmpeg.format='QUICKTIME';scene.render.ffmpeg.codec='QTRLE';scene.render.ffmpeg.constant_rate_factor='PERC_LOSSLESS';scene.render.filepath=out;scene.view_settings.look='AgX - Medium High Contrast'
world=bpy.data.worlds.new('World');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Strength'].default_value=0.0
cd=bpy.data.cameras.new('Camera');cam=bpy.data.objects.new('Camera',cd);scene.collection.objects.link(cam);scene.camera=cam;cam.location=(0,-5.5,1.45);cd.lens=58;direction=Vector((0,0,1.0))-cam.location;cam.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
ld=bpy.data.lights.new('SoftKey','AREA');lo=bpy.data.objects.new('SoftKey',ld);scene.collection.objects.link(lo);lo.location=(-2,-2,3.2);ld.energy=800;ld.size=2.2
fd=bpy.data.lights.new('SoftFill','AREA');fo=bpy.data.objects.new('SoftFill',fd);scene.collection.objects.link(fo);fo.location=(2,-1,2.0);fd.energy=240;fd.size=1.8

# Elastic hero mesh
pos=cfg.get('object_position',[0,0,1]);scale=cfg.get('object_scale',[.45,.45,.45])
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=5,radius=1.0,location=pos);hero=bpy.context.object;hero.name='SoftBodyHero';hero.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
mat=bpy.data.materials.new('SoftBodyMaterial');mat.use_nodes=True;bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(.19,.25,.34,1);bsdf.inputs['Roughness'].default_value=.38;hero.data.materials.append(mat)
# Soft-body modifier / settings
bpy.context.view_layer.objects.active=hero;hero.select_set(True)
bpy.ops.object.modifier_add(type='SOFT_BODY')
sb=hero.soft_body
if sb is None: raise RuntimeError('SOFT_BODY_SETTINGS_UNAVAILABLE')
settings=sb.settings
if hasattr(settings,'mass'): settings.mass=float(cfg['mass_kg'])
if hasattr(settings,'pull'): settings.pull=float(cfg['pull_stiffness'])
if hasattr(settings,'push'): settings.push=float(cfg['push_stiffness'])
if hasattr(settings,'bend'): settings.bend=float(cfg['bending_stiffness'])
if hasattr(settings,'damping'): settings.damping=float(cfg['damping'])
if hasattr(settings,'plastic'): settings.plastic=float(cfg['plasticity'])
if hasattr(settings,'goal_default'): settings.goal_default=float(cfg['goal_strength'])
if hasattr(settings,'use_goal'): settings.use_goal=float(cfg['goal_strength'])>0
if hasattr(settings,'use_edges'): settings.use_edges=True
if hasattr(settings,'collision_type'): settings.collision_type='MANUAL'
if hasattr(settings,'ball_size'): settings.ball_size=float(cfg['collision_ball_size'])
if hasattr(settings,'use_self_collision'): settings.use_self_collision=bool(cfg['use_self_collision'])
if hasattr(settings,'step_min'): settings.step_min=4
if hasattr(settings,'step_max'): settings.step_max=int(cfg['simulation_quality'])
sb.point_cache.frame_start=1;sb.point_cache.frame_end=int(cfg['frames'])

# Ground collision
bpy.ops.mesh.primitive_plane_add(size=12,location=(0,0,float(cfg['floor_z'])));floor=bpy.context.object;floor.name='SoftBodyFloor';floor.hide_render=True;floor.modifiers.new('Collision','COLLISION')
# Moving physical impactor
start=Vector(cfg.get('impactor_position_start',[-1.5,0,1]));end=Vector(cfg.get('impactor_position_end',[-.15,0,1]));frame=int(cfg.get('impact_frame',12))
bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=24,radius=float(cfg['impactor_radius']),location=start);imp=bpy.context.object;imp.name='SoftBodyImpactor';imp.hide_render=True;imp.modifiers.new('Collision','COLLISION');imp.location=start;imp.keyframe_insert(data_path='location',frame=1);imp.location=end;imp.keyframe_insert(data_path='location',frame=frame);imp.location=end;imp.keyframe_insert(data_path='location',frame=min(int(cfg['frames']),frame+8))
# Bake deterministic point cache
bpy.context.view_layer.objects.active=hero
for o in bpy.context.selected_objects:o.select_set(False)
hero.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(out),'softbody.blend'))
try:bpy.ops.ptcache.bake_all(bake=True)
except Exception as exc:raise RuntimeError('SOFT_BODY_CACHE_BAKE_FAILED:'+str(exc))
scene.render.filepath=out;bpy.ops.render.render(animation=True)
print(json.dumps({'contract':'${CREATIVE_SOFT_BODY_SIMULATION_RENDER_CONTRACT}','simulation_id':cfg['simulation_id'],'frames':cfg['frames'],'fps':cfg['fps'],'impact_frame':cfg['impact_frame'],'output_path':out},separators=(',',':')))
`;}
export async function renderSoftBodySimulation({project,simulation,output_spec={}}={}){
  const snapshot=snapshotId(project);if(!snapshot)throw new Error("SOFT_BODY_SIMULATION_BLENDER_SNAPSHOT_REQUIRED");const cfg=normalize(simulation,output_spec);const id=digest(cfg).slice(0,20);const base=`/tmp/avantiqo-softbody-simulation-${id}`;const scriptPath=`${base}/simulation.py`;const outputPath=`${base}/softbody-plate.mov`;const encoded=Buffer.from(JSON.stringify(cfg),"utf8").toString("base64");const sandbox=await CreativeSandboxRuntime.fromSnapshot({snapshot_id:snapshot,timeout_ms:1200000,network_policy:"deny-all"});
  try{await CreativeSandboxRuntime.writeText({sandbox,path:scriptPath,content:script(encoded,outputPath)});const execution=await CreativeSandboxRuntime.run({sandbox,cmd:"blender",args:["--background","--python",scriptPath],error_prefix:"CREATIVE_SOFT_BODY_SIMULATION_RENDER_FAILED"});const buffer=await CreativeSandboxRuntime.readBuffer({sandbox,path:outputPath});let metadata=null;try{metadata=execution.stdout.split("\n").map(x=>x.trim()).filter(Boolean).reverse().map(x=>{try{return JSON.parse(x)}catch{return null}}).find(Boolean)||null}catch{}return{contract:CREATIVE_SOFT_BODY_SIMULATION_RENDER_CONTRACT,simulation_id:cfg.simulation_id,mime_type:"video/quicktime",file_extension:"mov",buffer,bytes:buffer.length,configuration:cfg,metadata,transparent_alpha_required:true,deterministic_seed:cfg.seed,provider_calls_performed:false};}finally{await CreativeSandboxRuntime.stop(sandbox)}
}
export const CreativeSoftBodySimulationRenderRuntime=Object.freeze({contract:CREATIVE_SOFT_BODY_SIMULATION_RENDER_CONTRACT,render:renderSoftBodySimulation,supported_classes:["DEFORMABLE_SOFT_BODY"]});
