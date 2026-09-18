import crypto from "node:crypto";

import {
  CreativeSandboxRuntime,
} from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";

export const CREATIVE_PARTICLE_SIMULATION_RENDER_CONTRACT =
  "CREATIVE_PARTICLE_SIMULATION_RENDER_V1";

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function integer(value, fallback, min = 1, max = 10000) {
  return Math.min(max, Math.max(min, Math.round(finite(value, fallback))));
}
function snapshotId(project = {}) {
  return text(project?.metadata?.creative_tool_snapshots?.blender?.snapshot_id);
}
function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalize(simulation = {}, outputSpec = {}) {
  if (text(simulation.simulation_class).toUpperCase() !== "PARTICLE_GRANULAR") {
    throw new Error("PARTICLE_SIMULATION_CLASS_REQUIRED");
  }
  const p = simulation.execution_parameters || {};
  if (text(p.contract) !== "AVANTIQO_PARTICLE_SIMULATION_NUMERIC_PROFILE_V1") {
    throw new Error("PARTICLE_SIMULATION_NUMERIC_PROFILE_REQUIRED");
  }
  if (text(p.backend_family) !== "DETERMINISTIC_BALLISTIC_PARTICLE_PLATE") {
    throw new Error("PARTICLE_SIMULATION_BACKEND_FAMILY_INVALID");
  }
  const duration = finite(outputSpec.duration_seconds ?? p.duration_seconds, p.duration_seconds);
  const fps = integer(outputSpec.frame_rate ?? outputSpec.fps ?? p.frame_rate, p.frame_rate, 12, 120);
  return {
    simulation_id: text(simulation.simulation_id),
    intent: text(simulation.simulation_intent),
    width: integer(outputSpec.width, 1920, 320, 4096),
    height: integer(outputSpec.height, 1080, 180, 2160),
    fps,
    frames: integer(Math.ceil(duration * fps), Math.ceil(p.duration_seconds * p.frame_rate), 2, 1200),
    seed: integer(p.seed, 41000, 1, 2147483646),
    particle_count: integer(p.particle_count, 180, 8, 2000),
    emitter_position: Array.isArray(p.emitter_position) ? p.emitter_position.slice(0, 3).map((v) => finite(v, 0)) : [0, 0, 0],
    emitter_radius: finite(p.emitter_radius, 0.025),
    speed_min: finite(p.speed_min, 0.8),
    speed_max: finite(p.speed_max, 3.2),
    cone_degrees: finite(p.cone_degrees, 75),
    gravity_mps2: finite(p.gravity_mps2, -9.81),
    linear_drag: finite(p.linear_drag, 0.35),
    particle_radius_min: finite(p.particle_radius_min, 0.002),
    particle_radius_max: finite(p.particle_radius_max, 0.008),
    restitution: finite(p.restitution, 0.18),
    floor_z: finite(p.floor_z, -0.08),
    opacity_start: finite(p.opacity_start, 0.9),
    opacity_end: finite(p.opacity_end, 0.05),
  };
}

function blenderScript(encoded, outputPath) {
  return `
import base64, json, math, random
import bpy
from mathutils import Vector
cfg=json.loads(base64.b64decode("${encoded}").decode("utf-8"))
output_path=${JSON.stringify(outputPath)}
random.seed(cfg['seed'])
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE_NEXT'
scene.render.resolution_x=cfg['width']
scene.render.resolution_y=cfg['height']
scene.render.resolution_percentage=100
scene.render.fps=cfg['fps']
scene.frame_start=1
scene.frame_end=cfg['frames']
scene.render.film_transparent=True
scene.render.image_settings.file_format='FFMPEG'
scene.render.ffmpeg.format='QUICKTIME'
scene.render.ffmpeg.codec='QTRLE'
scene.render.ffmpeg.constant_rate_factor='PERC_LOSSLESS'
scene.render.filepath=output_path
scene.render.image_settings.color_mode='RGBA'
scene.view_settings.look='AgX - Medium High Contrast'
world=bpy.data.worlds.new('World')
scene.world=world
world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Strength'].default_value=0.0

cam_data=bpy.data.cameras.new('Camera')
cam=bpy.data.objects.new('Camera',cam_data)
scene.collection.objects.link(cam)
scene.camera=cam
cam.location=(0,-4.6,0.35)
cam.data.lens=52
look=Vector((0,0,0.15))-cam.location
cam.rotation_euler=look.to_track_quat('-Z','Y').to_euler()

light_data=bpy.data.lights.new('Key','AREA')
light=bpy.data.objects.new('Key',light_data)
scene.collection.objects.link(light)
light.location=(-1.2,-1.8,2.4)
light_data.energy=800
light_data.shape='DISK'
light_data.size=2.0
fill_data=bpy.data.lights.new('Fill','AREA')
fill=bpy.data.objects.new('Fill',fill_data)
scene.collection.objects.link(fill)
fill.location=(1.8,-0.5,1.1)
fill_data.energy=250
fill_data.size=1.5

mat=bpy.data.materials.new('ParticleMaterial')
mat.use_nodes=True
bsdf=mat.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Base Color'].default_value=(0.82,0.82,0.78,1.0)
bsdf.inputs['Roughness'].default_value=0.82

fps=float(cfg['fps'])
dt=1.0/fps
cone=math.radians(cfg['cone_degrees'])
emitter=Vector(cfg['emitter_position'])
for i in range(cfg['particle_count']):
    r=random.uniform(cfg['particle_radius_min'],cfg['particle_radius_max'])
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=max(0.0005,r))
    obj=bpy.context.object
    obj.name=f'Particle_{i:04d}'
    obj.data.materials.append(mat)
    theta=random.uniform(0,2*math.pi)
    polar=random.uniform(0,cone)
    speed=random.uniform(cfg['speed_min'],cfg['speed_max'])
    direction=Vector((math.sin(polar)*math.cos(theta), math.sin(polar)*math.sin(theta), math.cos(polar)))
    # tilt burst slightly toward camera for depth and readable parallax
    direction=(direction+Vector((0,-0.22,0.0))).normalized()
    velocity=direction*speed
    position=emitter+Vector((random.uniform(-1,1),random.uniform(-1,1),random.uniform(-1,1)))*cfg['emitter_radius']
    birth=random.randint(1,max(1,int(cfg['frames']*0.12)))
    obj.hide_render=True
    obj.keyframe_insert(data_path='hide_render',frame=max(1,birth-1))
    obj.hide_render=False
    obj.keyframe_insert(data_path='hide_render',frame=birth)
    for frame in range(birth,cfg['frames']+1):
        drag=max(0.0,1.0-cfg['linear_drag']*dt)
        velocity.x*=drag; velocity.y*=drag; velocity.z=velocity.z*drag+cfg['gravity_mps2']*dt
        position+=velocity*dt
        if position.z<cfg['floor_z']:
            position.z=cfg['floor_z']
            if velocity.z<0: velocity.z=-velocity.z*cfg['restitution']
            velocity.x*=0.72; velocity.y*=0.72
        obj.location=position
        obj.scale=(1,1,1)
        obj.keyframe_insert(data_path='location',frame=frame)
    obj.hide_render=True
    obj.keyframe_insert(data_path='hide_render',frame=cfg['frames']+1)

scene.render.filepath=output_path
bpy.ops.render.render(animation=True)
print(json.dumps({'contract':'${CREATIVE_PARTICLE_SIMULATION_RENDER_CONTRACT}','frames':cfg['frames'],'fps':cfg['fps'],'particle_count':cfg['particle_count'],'seed':cfg['seed'],'output_path':output_path},separators=(',',':')))
`;
}

export async function renderParticleSimulation({ project, simulation, output_spec = {} } = {}) {
  const snapshot = snapshotId(project);
  if (!snapshot) throw new Error("PARTICLE_SIMULATION_BLENDER_SNAPSHOT_REQUIRED");
  const config = normalize(simulation, output_spec);
  const identity = digest(config).slice(0, 20);
  const base = `/tmp/avantiqo-particle-simulation-${identity}`;
  const scriptPath = `${base}/simulation.py`;
  const outputPath = `${base}/particle-plate.mov`;
  const encoded = Buffer.from(JSON.stringify(config), "utf8").toString("base64");
  const sandbox = await CreativeSandboxRuntime.fromSnapshot({
    snapshot_id: snapshot,
    timeout_ms: 900000,
    network_policy: "deny-all",
  });
  try {
    await CreativeSandboxRuntime.writeText({ sandbox, path: scriptPath, content: blenderScript(encoded, outputPath) });
    const execution = await CreativeSandboxRuntime.run({
      sandbox,
      cmd: "blender",
      args: ["--background", "--python", scriptPath],
      error_prefix: "CREATIVE_PARTICLE_SIMULATION_RENDER_FAILED",
    });
    const buffer = await CreativeSandboxRuntime.readBuffer({ sandbox, path: outputPath });
    let metadata = null;
    try {
      metadata = execution.stdout.split("\n").map((v) => v.trim()).filter(Boolean).reverse().map((v) => { try { return JSON.parse(v); } catch { return null; } }).find(Boolean) || null;
    } catch { metadata = null; }
    return {
      contract: CREATIVE_PARTICLE_SIMULATION_RENDER_CONTRACT,
      simulation_id: config.simulation_id,
      mime_type: "video/quicktime",
      file_extension: "mov",
      buffer,
      bytes: buffer.length,
      configuration: config,
      metadata,
      transparent_alpha_required: true,
      deterministic_seed: config.seed,
      provider_calls_performed: false,
    };
  } finally {
    await CreativeSandboxRuntime.stop(sandbox);
  }
}

export const CreativeParticleSimulationRenderRuntime = Object.freeze({
  contract: CREATIVE_PARTICLE_SIMULATION_RENDER_CONTRACT,
  render: renderParticleSimulation,
  supported_classes: ["PARTICLE_GRANULAR"],
});
