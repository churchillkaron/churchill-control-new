import crypto from "node:crypto";
import { CreativeSandboxRuntime } from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";

export const CREATIVE_CLOTH_SIMULATION_RENDER_CONTRACT="CREATIVE_CLOTH_SIMULATION_RENDER_V1";
function text(v){return String(v??"").trim();}
function finite(v,f){const n=Number(v);return Number.isFinite(n)?n:f;}
function integer(v,f,min=1,max=10000){return Math.min(max,Math.max(min,Math.round(finite(v,f))));}
function snapshotId(project={}){return text(project?.metadata?.creative_tool_snapshots?.blender?.snapshot_id);}
function digest(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");}
function normalize(simulation={},spec={}){
  if(text(simulation.simulation_class).toUpperCase()!=="DEFORMABLE_CLOTH") throw new Error("CLOTH_SIMULATION_CLASS_REQUIRED");
  const p=simulation.execution_parameters||{};if(text(p.contract)!=="AVANTIQO_CLOTH_SIMULATION_NUMERIC_PROFILE_V1") throw new Error("CLOTH_SIMULATION_NUMERIC_PROFILE_REQUIRED");
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
cd=bpy.data.cameras.new('Camera');cam=bpy.data.objects.new('Camera',cd);scene.collection.objects.link(cam);scene.camera=cam;cam.location=(0,-5.8,1.5);cd.lens=58;direction=Vector((0,0,1.3))-cam.location;cam.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
ld=bpy.data.lights.new('ClothKey','AREA');lo=bpy.data.objects.new('ClothKey',ld);scene.collection.objects.link(lo);lo.location=(-2,-2,3.5);ld.energy=780;ld.size=2.4
fd=bpy.data.lights.new('ClothFill','AREA');fo=bpy.data.objects.new('ClothFill',fd);scene.collection.objects.link(fo);fo.location=(2,-1,2.2);fd.energy=220;fd.size=2.0

# Build a vertical grid so the top edge can be physically pinned.
nx=int(cfg['subdivisions_x']);ny=int(cfg['subdivisions_y']);w=float(cfg['cloth_width']);h=float(cfg['cloth_height']);p=cfg.get('cloth_position',[0,0,1.5]);verts=[];faces=[]
for iy in range(ny+1):
    z=p[2]+h*(.5-iy/ny)
    for ix in range(nx+1):
        x=p[0]+w*(ix/nx-.5);verts.append((x,p[1],z))
for iy in range(ny):
    for ix in range(nx):
        a=iy*(nx+1)+ix;b=a+1;c=a+(nx+1);d=c+1;faces.append((a,c,d,b))
mesh=bpy.data.meshes.new('ClothMesh');mesh.from_pydata(verts,[],faces);mesh.update();cloth=bpy.data.objects.new('Cloth',mesh);scene.collection.objects.link(cloth)
# Pin governed edge.
vg=cloth.vertex_groups.new(name='PinGroup');edge=str(cfg.get('pinned_edge','TOP')).upper();pins=[]
for iy in range(ny+1):
    for ix in range(nx+1):
        idx=iy*(nx+1)+ix
        if (edge=='TOP' and iy==0) or (edge=='BOTTOM' and iy==ny) or (edge=='LEFT' and ix==0) or (edge=='RIGHT' and ix==nx): pins.append(idx)
vg.add(pins,1.0,'REPLACE')
mat=bpy.data.materials.new('ClothMaterial');mat.use_nodes=True;bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(.14,.16,.2,1);bsdf.inputs['Roughness'].default_value=.58;cloth.data.materials.append(mat)
solid=cloth.modifiers.new('MicroThickness','SOLIDIFY');solid.thickness=.003
sub=cloth.modifiers.new('RenderSubdivision','SUBSURF');sub.levels=1;sub.render_levels=1
cm=cloth.modifiers.new('ClothPhysics','CLOTH');cs=cm.settings;cs.quality=int(cfg['simulation_quality']);cs.mass=float(cfg['mass_kg']);cs.vertex_group_mass='PinGroup';cs.air_damping=float(cfg['air_damping'])
for name,key in [('tension_stiffness','tension_stiffness'),('compression_stiffness','compression_stiffness'),('shear_stiffness','shear_stiffness'),('bending_stiffness','bending_stiffness'),('tension_damping','tension_damping'),('compression_damping','compression_damping'),('shear_damping','shear_damping'),('bending_damping','bending_damping')]:
    if hasattr(cs,name): setattr(cs,name,float(cfg[key]))
cs.use_sewing_springs=False
coll=cm.collision_settings
if coll:
    coll.use_collision=True;coll.distance_min=.004;coll.collision_quality=int(cfg['collision_quality']);coll.use_self_collision=bool(cfg['self_collision']);coll.self_distance_min=float(cfg['self_collision_distance'])
cm.point_cache.frame_start=1;cm.point_cache.frame_end=int(cfg['frames'])

# Floor collider.
bpy.ops.mesh.primitive_plane_add(size=12,location=(0,0,float(cfg['floor_z'])));floor=bpy.context.object;floor.name='FloorCollider';floor.hide_render=True;floor.modifiers.new('Collision','COLLISION')
# Wind force field.
wd=cfg.get('wind_direction',[1,0,.15]);direction=Vector(wd)
if direction.length<1e-6: direction=Vector((1,0,0))
bpy.ops.object.effector_add(type='WIND',location=(-2,0,1.5));wind=bpy.context.object;wind.name='Wind';wind.rotation_euler=direction.to_track_quat('Z','Y').to_euler();wind.field.strength=float(cfg['wind_strength']);wind.field.noise=float(cfg['wind_noise']);wind.field.seed=int(cfg['seed']) if hasattr(wind.field,'seed') else 0
# Bake point cache for deterministic replay.
bpy.context.view_layer.objects.active=cloth
for o in bpy.context.selected_objects:o.select_set(False)
cloth.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(out),'cloth.blend'))
try:bpy.ops.ptcache.bake_all(bake=True)
except Exception as exc:raise RuntimeError('CLOTH_CACHE_BAKE_FAILED:'+str(exc))
scene.render.filepath=out;bpy.ops.render.render(animation=True)
print(json.dumps({'contract':'${CREATIVE_CLOTH_SIMULATION_RENDER_CONTRACT}','simulation_id':cfg['simulation_id'],'frames':cfg['frames'],'fps':cfg['fps'],'vertex_count':len(verts),'pinned_vertex_count':len(pins),'output_path':out},separators=(',',':')))
`;}
export async function renderClothSimulation({project,simulation,output_spec={}}={}){
 const snapshot=snapshotId(project);if(!snapshot)throw new Error("CLOTH_SIMULATION_BLENDER_SNAPSHOT_REQUIRED");const cfg=normalize(simulation,output_spec);const id=digest(cfg).slice(0,20);const base=`/tmp/avantiqo-cloth-simulation-${id}`;const scriptPath=`${base}/simulation.py`;const outputPath=`${base}/cloth-plate.mov`;const encoded=Buffer.from(JSON.stringify(cfg),"utf8").toString("base64");const sandbox=await CreativeSandboxRuntime.fromSnapshot({snapshot_id:snapshot,timeout_ms:1200000,network_policy:"deny-all"});
 try{await CreativeSandboxRuntime.writeText({sandbox,path:scriptPath,content:script(encoded,outputPath)});const execution=await CreativeSandboxRuntime.run({sandbox,cmd:"blender",args:["--background","--python",scriptPath],error_prefix:"CREATIVE_CLOTH_SIMULATION_RENDER_FAILED"});const buffer=await CreativeSandboxRuntime.readBuffer({sandbox,path:outputPath});let metadata=null;try{metadata=execution.stdout.split("\n").map(x=>x.trim()).filter(Boolean).reverse().map(x=>{try{return JSON.parse(x)}catch{return null}}).find(Boolean)||null}catch{}return{contract:CREATIVE_CLOTH_SIMULATION_RENDER_CONTRACT,simulation_id:cfg.simulation_id,mime_type:"video/quicktime",file_extension:"mov",buffer,bytes:buffer.length,configuration:cfg,metadata,transparent_alpha_required:true,deterministic_seed:cfg.seed,provider_calls_performed:false};}finally{await CreativeSandboxRuntime.stop(sandbox)}
}
export const CreativeClothSimulationRenderRuntime=Object.freeze({contract:CREATIVE_CLOTH_SIMULATION_RENDER_CONTRACT,render:renderClothSimulation,supported_classes:["DEFORMABLE_CLOTH"]});
