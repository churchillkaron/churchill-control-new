import crypto from "node:crypto";

import {
  CreativeSandboxRuntime,
} from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";

const CONTRACT = "CREATIVE_BLENDER_RUNTIME_V1";
const TOOL_ID = "blender";

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback, minimum = 1, maximum = 10000) {
  const number = Math.floor(finite(value, fallback));
  return Math.min(maximum, Math.max(minimum, number));
}

function snapshotId(project) {
  return text(project?.metadata?.creative_tool_snapshots?.[TOOL_ID]?.snapshot_id);
}

function jobId(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 20);
}

function vector(value, fallback = [0, 0, 0]) {
  if (!Array.isArray(value) || value.length < 3) return fallback;
  return [
    finite(value[0], fallback[0]),
    finite(value[1], fallback[1]),
    finite(value[2], fallback[2]),
  ];
}

function color(value, fallback = [1, 1, 1, 1]) {
  if (!Array.isArray(value) || value.length < 3) return fallback;
  return [
    Math.max(0, Math.min(1, finite(value[0], fallback[0]))),
    Math.max(0, Math.min(1, finite(value[1], fallback[1]))),
    Math.max(0, Math.min(1, finite(value[2], fallback[2]))),
    Math.max(0, Math.min(1, finite(value[3], fallback[3]))),
  ];
}

function normalizeScene(scene = {}) {
  const objects = Array.isArray(scene.objects) ? scene.objects.slice(0, 40) : [];
  const normalizedObjects = objects.map((item, index) => {
    const type = text(item?.type).toUpperCase();
    if (!["TEXT", "PANEL", "CUBE", "SPHERE", "PLANE", "RING"].includes(type)) {
      throw new Error(`CREATIVE_BLENDER_OBJECT_TYPE_UNSUPPORTED:${type || index}`);
    }
    return {
      type,
      name: text(item?.name) || `Object ${index + 1}`,
      text: type === "TEXT" ? text(item?.text).slice(0, 300) : null,
      location: vector(item?.location),
      rotation: vector(item?.rotation),
      scale: vector(item?.scale, [1, 1, 1]),
      color: color(item?.color),
      emission: Math.max(0, Math.min(20, finite(item?.emission, 0))),
      metallic: Math.max(0, Math.min(1, finite(item?.metallic, 0))),
      roughness: Math.max(0, Math.min(1, finite(item?.roughness, 0.35))),
      alpha: Math.max(0, Math.min(1, finite(item?.alpha, 1))),
      bevel: Math.max(0, Math.min(1, finite(item?.bevel, 0.04))),
      extrude: Math.max(0, Math.min(2, finite(item?.extrude, 0.03))),
      align_x: ["LEFT", "CENTER", "RIGHT", "JUSTIFY"].includes(text(item?.align_x).toUpperCase())
        ? text(item?.align_x).toUpperCase()
        : "CENTER",
      keyframes: Array.isArray(item?.keyframes)
        ? item.keyframes.slice(0, 20).map((keyframe) => ({
            frame: integer(keyframe?.frame, 1, 1, 10000),
            location: keyframe?.location ? vector(keyframe.location) : null,
            rotation: keyframe?.rotation ? vector(keyframe.rotation) : null,
            scale: keyframe?.scale ? vector(keyframe.scale, [1, 1, 1]) : null,
          }))
        : [],
    };
  });

  const lights = Array.isArray(scene.lights) ? scene.lights.slice(0, 12) : [];

  return {
    width: integer(scene.width, 1920, 64, 7680),
    height: integer(scene.height, 1080, 64, 4320),
    fps: integer(scene.fps, 24, 1, 120),
    frames: integer(scene.frames, 1, 1, 3600),
    transparent: scene.transparent !== false,
    world_color: color(scene.world_color, [0.005, 0.007, 0.012, 1]),
    camera: {
      location: vector(scene.camera?.location, [0, 0, 8]),
      rotation: vector(scene.camera?.rotation, [0, 0, 0]),
      lens: Math.max(10, Math.min(200, finite(scene.camera?.lens, 50))),
      look_at: scene.camera?.look_at ? vector(scene.camera.look_at) : null,
    },
    objects: normalizedObjects,
    lights: lights.map((light, index) => ({
      name: text(light?.name) || `Light ${index + 1}`,
      type: ["AREA", "POINT", "SUN", "SPOT"].includes(text(light?.type).toUpperCase())
        ? text(light?.type).toUpperCase()
        : "AREA",
      location: vector(light?.location, [0, 2, 4]),
      rotation: vector(light?.rotation),
      color: color(light?.color),
      energy: Math.max(0, Math.min(100000, finite(light?.energy, 800))),
      size: Math.max(0.01, Math.min(100, finite(light?.size, 5))),
    })),
  };
}

function scriptSource(encodedScene, outputPath) {
  return `
import base64
import json
import math
import bpy
from mathutils import Vector

scene_cfg = json.loads(base64.b64decode("${encodedScene}").decode("utf-8"))
output_path = ${JSON.stringify(outputPath)}

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.render.resolution_x = scene_cfg['width']
scene.render.resolution_y = scene_cfg['height']
scene.render.resolution_percentage = 100
scene.render.fps = scene_cfg['fps']
scene.frame_start = 1
scene.frame_end = scene_cfg['frames']
scene.render.film_transparent = bool(scene_cfg['transparent'])
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.color_depth = '8'
scene.render.filepath = output_path
scene.render.use_file_extension = True
scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.render.image_settings.color_mode = 'RGBA'

world = bpy.data.worlds.new('World')
scene.world = world
world.use_nodes = True
background = world.node_tree.nodes.get('Background')
background.inputs['Color'].default_value = scene_cfg['world_color']
background.inputs['Strength'].default_value = 0.25


def material_for(item):
    mat = bpy.data.materials.new(item['name'] + ' Material')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get('Principled BSDF')
    rgba = item['color']
    alpha = item['alpha']
    bsdf.inputs['Base Color'].default_value = rgba
    bsdf.inputs['Metallic'].default_value = item['metallic']
    bsdf.inputs['Roughness'].default_value = item['roughness']
    bsdf.inputs['Alpha'].default_value = alpha
    if item['emission'] > 0:
        if 'Emission Color' in bsdf.inputs:
            bsdf.inputs['Emission Color'].default_value = rgba
            bsdf.inputs['Emission Strength'].default_value = item['emission']
        elif 'Emission' in bsdf.inputs:
            bsdf.inputs['Emission'].default_value = rgba
    mat.surface_render_method = 'DITHERED' if alpha < 0.999 else 'DITHERED'
    return mat


def apply_transform(obj, item):
    obj.name = item['name']
    obj.location = item['location']
    obj.rotation_euler = [math.radians(v) for v in item['rotation']]
    obj.scale = item['scale']
    for frame in item['keyframes']:
        scene.frame_set(frame['frame'])
        if frame.get('location') is not None:
            obj.location = frame['location']
            obj.keyframe_insert(data_path='location')
        if frame.get('rotation') is not None:
            obj.rotation_euler = [math.radians(v) for v in frame['rotation']]
            obj.keyframe_insert(data_path='rotation_euler')
        if frame.get('scale') is not None:
            obj.scale = frame['scale']
            obj.keyframe_insert(data_path='scale')
    scene.frame_set(1)


def add_object(item):
    kind = item['type']
    if kind == 'TEXT':
        bpy.ops.object.text_add()
        obj = bpy.context.object
        obj.data.body = item['text'] or ''
        obj.data.align_x = item['align_x']
        obj.data.align_y = 'CENTER'
        obj.data.extrude = item['extrude']
        obj.data.bevel_depth = item['bevel']
        obj.data.bevel_resolution = 6
    elif kind == 'PANEL':
        bpy.ops.mesh.primitive_cube_add()
        obj = bpy.context.object
        obj.scale = [2.2, 1.25, 0.035]
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        bevel = obj.modifiers.new('Bevel', 'BEVEL')
        bevel.width = item['bevel']
        bevel.segments = 8
    elif kind == 'CUBE':
        bpy.ops.mesh.primitive_cube_add()
        obj = bpy.context.object
        bevel = obj.modifiers.new('Bevel', 'BEVEL')
        bevel.width = item['bevel']
        bevel.segments = 6
    elif kind == 'SPHERE':
        bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48)
        obj = bpy.context.object
    elif kind == 'PLANE':
        bpy.ops.mesh.primitive_plane_add(size=2)
        obj = bpy.context.object
    elif kind == 'RING':
        bpy.ops.mesh.primitive_torus_add(major_radius=1.0, minor_radius=0.035, major_segments=128, minor_segments=24)
        obj = bpy.context.object
    else:
        raise RuntimeError('CREATIVE_BLENDER_OBJECT_UNSUPPORTED:' + kind)
    apply_transform(obj, item)
    obj.data.materials.append(material_for(item))
    return obj


for item in scene_cfg['objects']:
    add_object(item)

for item in scene_cfg['lights']:
    light_data = bpy.data.lights.new(item['name'], type=item['type'])
    light_data.color = item['color'][:3]
    light_data.energy = item['energy']
    if hasattr(light_data, 'shape') and item['type'] == 'AREA':
        light_data.shape = 'DISK'
        light_data.size = item['size']
    light = bpy.data.objects.new(item['name'], light_data)
    scene.collection.objects.link(light)
    light.location = item['location']
    light.rotation_euler = [math.radians(v) for v in item['rotation']]

camera_data = bpy.data.cameras.new('Camera')
camera = bpy.data.objects.new('Camera', camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera.location = scene_cfg['camera']['location']
camera.rotation_euler = [math.radians(v) for v in scene_cfg['camera']['rotation']]
camera.data.lens = scene_cfg['camera']['lens']

look_at = scene_cfg['camera'].get('look_at')
if look_at is not None:
    direction = Vector(look_at) - camera.location
    camera.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

scene.view_settings.look = 'AgX - Medium High Contrast'
scene.render.image_settings.file_format = 'PNG'

if scene_cfg['frames'] == 1:
    scene.render.filepath = output_path
    bpy.ops.render.render(write_still=True)
else:
    scene.render.image_settings.file_format = 'FFMPEG'
    scene.render.ffmpeg.format = 'QUICKTIME'
    scene.render.ffmpeg.codec = 'QTRLE'
    scene.render.ffmpeg.constant_rate_factor = 'PERC_LOSSLESS'
    scene.render.filepath = output_path
    bpy.ops.render.render(animation=True)

print(json.dumps({
    'frames': scene_cfg['frames'],
    'width': scene_cfg['width'],
    'height': scene_cfg['height'],
    'fps': scene_cfg['fps'],
    'output_path': output_path,
}))
`;
}

export async function renderCreativeBlenderScene({
  project,
  scene,
} = {}) {
  const snapshot = snapshotId(project);
  if (!snapshot) throw new Error("CREATIVE_BLENDER_SNAPSHOT_REQUIRED");

  const normalized = normalizeScene(scene || {});
  const identity = jobId(normalized);
  const base = `/tmp/avantiqo-blender-job-${identity}`;
  const scriptPath = `${base}/scene.py`;
  const outputPath = normalized.frames === 1
    ? `${base}/render.png`
    : `${base}/render.mov`;
  const encodedScene = Buffer
    .from(JSON.stringify(normalized), "utf8")
    .toString("base64");

  const sandbox = await CreativeSandboxRuntime.fromSnapshot({
    snapshot_id: snapshot,
    timeout_ms: normalized.frames === 1 ? 300000 : 900000,
    network_policy: "deny-all",
  });

  try {
    await CreativeSandboxRuntime.writeText({
      sandbox,
      path: scriptPath,
      content: scriptSource(encodedScene, outputPath),
    });
    const execution = await CreativeSandboxRuntime.run({
      sandbox,
      cmd: "blender",
      args: ["--background", "--python", scriptPath],
      error_prefix: "CREATIVE_BLENDER_RENDER_FAILED",
    });
    const buffer = await CreativeSandboxRuntime.readBuffer({
      sandbox,
      path: outputPath,
    });

    let metadata = null;
    try {
      const line = execution.stdout
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean)
        .reverse()
        .find((value) => value.startsWith("{"));
      metadata = line ? JSON.parse(line) : null;
    } catch {
      metadata = null;
    }

    return {
      contract: CONTRACT,
      tool_id: TOOL_ID,
      mime_type: normalized.frames === 1 ? "image/png" : "video/quicktime",
      buffer,
      bytes: buffer.length,
      scene: normalized,
      metadata,
    };
  } finally {
    await CreativeSandboxRuntime.stop(sandbox);
  }
}

export const CreativeBlenderRuntime = Object.freeze({
  contract: CONTRACT,
  render: renderCreativeBlenderScene,
});
