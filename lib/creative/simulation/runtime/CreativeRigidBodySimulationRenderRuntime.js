import crypto from "node:crypto";
import { CreativeSandboxRuntime } from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";

export const CREATIVE_RIGID_BODY_SIMULATION_RENDER_CONTRACT="CREATIVE_RIGID_BODY_SIMULATION_RENDER_V1";
function text(v){return String(v??"").trim();}
function finite(v,f){const n=Number(v);return Number.isFinite(n)?n:f;}
function integer(v,f,min=1,max=10000){return Math.min(max,Math.max(min,Math.round(finite(v,f))));}
function snapshotId(project={}){return text(project?.metadata?.creative_tool_snapshots?.blender?.snapshot_id);}
function digest(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");}
function vec(v,f=[0,0,0]){return Array.isArray(v)&&v.length>=3?v.slice(0,3).map((x,i)=>finite(x,f[i])):f;}
function normalize(simulation={},spec={}){
  const klass=text(simulation.simulation_class).toUpperCase();
  if(!["RIGID_BODY","DESTRUCTION_FRACTURE"].includes(klass)) throw new Error("RIGID_SIMULATION_CLASS_REQUIRED");
  const p=simulation.execution_parameters||{};
  const expected=klass==="RIGID_BODY"?"AVANTIQO_RIGID_BODY_NUMERIC_PROFILE_V1":"AVANTIQO_FRACTURE_SIMULATION_NUMERIC_PROFILE_V1";
  if(text(p.contract)!==expected) throw new Error("RIGID_SIMULATION_NUMERIC_PROFILE_REQUIRED");
  const fps=integer(spec.frame_rate||spec.fps||p.frame_rate,p.frame_rate||24,12,120);
  const duration=Math.max(.2,finite(spec.duration_seconds??p.duration_seconds,p.duration_seconds||3));
  return {class:klass,simulation_id:text(simulation.simulation_id),width:integer(spec.width,1920,320,4096),height:integer(spec.height,1080,180,2160),fps,frames:integer(Math.ceil(duration*fps),72,2,1200),...p};
}
function script(encoded,output){return `
import base64,json,math,random
import bpy
from mathutils import Vector
cfg=json.loads(base64.b64decode("${encoded}").decode("utf-8"))
out=${JSON.stringify(output)}
random.seed(int(cfg['seed']))
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
engine_items={item.identifier for item in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items}
scene.render.engine='BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engine_items else ('BLENDER_EEVEE' if 'BLENDER_EEVEE' in engine_items else 'CYCLES')
scene.render.resolution_x=int(cfg['width']);scene.render.resolution_y=int(cfg['height']);scene.render.resolution_percentage=100
scene.render.fps=int(cfg['fps']);scene.frame_start=1;scene.frame_end=int(cfg['frames']);scene.render.film_transparent=True
scene.render.image_settings.file_format='FFMPEG';scene.render.image_settings.color_mode='RGBA';scene.render.ffmpeg.format='QUICKTIME';scene.render.ffmpeg.codec='QTRLE';scene.render.filepath=out
scene.gravity=(0,0,float(cfg['gravity_mps2']))
bpy.ops.rigidbody.world_add()
scene.rigidbody_world.substeps_per_frame=int(cfg.get('solver_substeps',12))
scene.rigidbody_world.solver_iterations=int(cfg.get('solver_iterations',20))
world=bpy.data.worlds.new('World');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Strength'].default_value=0.0

def mat(name,color=(.7,.7,.72,1),rough=.32,metal=.05):
    m=bpy.data.materials.new(name);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=color;b.inputs['Roughness'].default_value=rough;b.inputs['Metallic'].default_value=metal;return m

def camera_light():
    cd=bpy.data.cameras.new('Camera');cam=bpy.data.objects.new('Camera',cd);scene.collection.objects.link(cam);scene.camera=cam;cam.location=(0,-4.8,1.4);cd.lens=58;cam.rotation_euler=(math.radians(76),0,0)
    ld=bpy.data.lights.new('Key','AREA');lo=bpy.data.objects.new('Key',ld);scene.collection.objects.link(lo);lo.location=(-2,-2,3.8);ld.energy=950;ld.size=2.2
    fd=bpy.data.lights.new('Fill','AREA');fo=bpy.data.objects.new('Fill',fd);scene.collection.objects.link(fo);fo.location=(2,-1,2.2);fd.energy=260;fd.size=1.8

def floor(z):
    bpy.ops.mesh.primitive_plane_add(size=12,location=(0,0,float(z)));o=bpy.context.object;o.name='CollisionFloor';o.data.materials.append(mat('Floor',(0.18,.18,.2,1),.55,.0));bpy.ops.rigidbody.object_add();o.rigid_body.type='PASSIVE';o.rigid_body.friction=float(cfg.get('friction',.3));o.rigid_body.restitution=float(cfg.get('restitution',.1))

def add_shape(shape,dims,pos):
    shape=str(shape).upper()
    if shape=='CUBE': bpy.ops.mesh.primitive_cube_add(location=pos);o=bpy.context.object;o.scale=[max(.001,d/2) for d in dims]
    elif shape=='CYLINDER': bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=max(dims[0],dims[1])/2,depth=dims[2],location=pos);o=bpy.context.object
    else: bpy.ops.mesh.primitive_uv_sphere_add(segments=64,ring_count=32,radius=max(dims)/2,location=pos);o=bpy.context.object
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return o

def rigid():
    o=add_shape(cfg.get('object_shape','SPHERE'),cfg.get('object_dimensions',[.12,.12,.12]),cfg.get('initial_position',[0,0,.25]));o.name='RigidHero';o.data.materials.append(mat('Hero',(0.72,.76,.82,1),.18,.2));bpy.ops.rigidbody.object_add();rb=o.rigid_body;rb.mass=float(cfg['mass_kg']);rb.friction=float(cfg['friction']);rb.restitution=float(cfg['restitution']);rb.linear_damping=float(cfg.get('linear_damping',.04));rb.angular_damping=float(cfg.get('angular_damping',.08));rb.collision_margin=float(cfg.get('collision_margin',.002));rb.use_margin=True
    o.location=cfg.get('initial_position',[0,0,.25]);o.keyframe_insert(data_path='location',frame=1)
    # Blender does not expose persistent initial velocity directly; keyframe two frames to author initial state before rigid sim takes over.
    v=Vector(cfg.get('initial_velocity',[0,0,0]));w=Vector(cfg.get('initial_angular_velocity',[0,0,0]));dt=1.0/float(cfg['fps']);o.location=Vector(o.location)+v*dt;o.rotation_euler=[w.x*dt,w.y*dt,w.z*dt];o.keyframe_insert(data_path='location',frame=2);o.keyframe_insert(data_path='rotation_euler',frame=2);rb.kinematic=True;rb.keyframe_insert(data_path='kinematic',frame=1);rb.keyframe_insert(data_path='kinematic',frame=2);rb.kinematic=False;rb.keyframe_insert(data_path='kinematic',frame=3)

def fracture():
    center=Vector(cfg.get('source_position',[0,0,.45]));count=int(cfg.get('fracture_piece_count',24));radius=float(cfg.get('fracture_radius',.32));trigger=int(cfg.get('trigger_frame',8));mass=float(cfg.get('source_mass_kg',.6));imp=float(cfg.get('impulse_strength',3.6))
    # intact hero shell visible until trigger
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4,radius=radius,location=center);hero=bpy.context.object;hero.name='IntactSource';hero.data.materials.append(mat('Source',(0.65,.7,.78,1),.24,.12));hero.hide_render=False;hero.keyframe_insert(data_path='hide_render',frame=max(1,trigger-1));hero.hide_render=True;hero.keyframe_insert(data_path='hide_render',frame=trigger)
    for i in range(count):
        theta=random.uniform(0,2*math.pi);u=random.uniform(-1,1);phi=math.acos(u);direction=Vector((math.sin(phi)*math.cos(theta),math.sin(phi)*math.sin(theta),math.cos(phi)))
        r=radius*random.uniform(.35,.88);pos=center+direction*r*.35;scale=radius*random.uniform(.13,.28)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=scale,location=pos);o=bpy.context.object;o.name=f'Fragment_{i:03d}';o.scale=(random.uniform(.6,1.5),random.uniform(.5,1.4),random.uniform(.5,1.5));bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat(f'FragMat{i}',(.58+random.random()*.12,.62+random.random()*.12,.7+random.random()*.12,1),.3,.08));bpy.ops.rigidbody.object_add();rb=o.rigid_body;rb.mass=mass/count;rb.friction=float(cfg['friction']);rb.restitution=float(cfg['restitution']);rb.linear_damping=float(cfg.get('linear_damping',.08));rb.angular_damping=float(cfg.get('angular_damping',.1));rb.kinematic=True;rb.keyframe_insert(data_path='kinematic',frame=max(1,trigger-1));rb.kinematic=False;rb.keyframe_insert(data_path='kinematic',frame=trigger)
        o.hide_render=True;o.keyframe_insert(data_path='hide_render',frame=max(1,trigger-1));o.hide_render=False;o.keyframe_insert(data_path='hide_render',frame=trigger)
        # impulse authored via one-frame displacement before solver release
        vel=direction*imp*random.uniform(.55,1.2)+Vector((0,random.uniform(-.25,.25),random.uniform(.1,.7)));o.location=pos+vel*(1.0/float(cfg['fps']));o.keyframe_insert(data_path='location',frame=trigger+1)

camera_light();floor(cfg.get('floor_z',0))
if cfg['class']=='RIGID_BODY': rigid()
else: fracture()
scene.render.filepath=out;bpy.ops.render.render(animation=True)
print(json.dumps({'contract':'${CREATIVE_RIGID_BODY_SIMULATION_RENDER_CONTRACT}','simulation_id':cfg['simulation_id'],'simulation_class':cfg['class'],'frames':cfg['frames'],'fps':cfg['fps'],'output_path':out},separators=(',',':')))
`;}
export async function renderRigidBodySimulation({project,simulation,output_spec={}}={}){
  const snapshot=snapshotId(project);if(!snapshot) throw new Error("RIGID_SIMULATION_BLENDER_SNAPSHOT_REQUIRED");const cfg=normalize(simulation,output_spec);const id=digest(cfg).slice(0,20);const base=`/tmp/avantiqo-rigid-simulation-${id}`;const scriptPath=`${base}/simulation.py`;const outputPath=`${base}/rigid-plate.mov`;const encoded=Buffer.from(JSON.stringify(cfg),"utf8").toString("base64");const sandbox=await CreativeSandboxRuntime.fromSnapshot({snapshot_id:snapshot,timeout_ms:900000,network_policy:"deny-all"});
  try{await CreativeSandboxRuntime.writeText({sandbox,path:scriptPath,content:script(encoded,outputPath)});const execution=await CreativeSandboxRuntime.run({sandbox,cmd:"blender",args:["--background","--python",scriptPath],error_prefix:"CREATIVE_RIGID_SIMULATION_RENDER_FAILED"});const buffer=await CreativeSandboxRuntime.readBuffer({sandbox,path:outputPath});let metadata=null;try{metadata=execution.stdout.split("\n").map(x=>x.trim()).filter(Boolean).reverse().map(x=>{try{return JSON.parse(x)}catch{return null}}).find(Boolean)||null}catch{}return{contract:CREATIVE_RIGID_BODY_SIMULATION_RENDER_CONTRACT,simulation_id:cfg.simulation_id,simulation_class:cfg.class,mime_type:"video/quicktime",file_extension:"mov",buffer,bytes:buffer.length,configuration:cfg,metadata,transparent_alpha_required:true,deterministic_seed:cfg.seed,provider_calls_performed:false};}finally{await CreativeSandboxRuntime.stop(sandbox)}
}
export const CreativeRigidBodySimulationRenderRuntime=Object.freeze({contract:CREATIVE_RIGID_BODY_SIMULATION_RENDER_CONTRACT,render:renderRigidBodySimulation,supported_classes:["RIGID_BODY","DESTRUCTION_FRACTURE"]});
