import {
  createProductionNode,
  createProductionEdge,
} from "@/lib/creative/production-graph/documents/ProductionGraph";
import {
  CreativeImageAssetAuthorityRuntime,
} from "@/lib/creative/image/runtime/CreativeImageAssetAuthorityRuntime";
import {
  CreativeImageCameraAuthorityRuntime,
} from "@/lib/creative/image/runtime/CreativeImageCameraAuthorityRuntime";

export const CREATIVE_IMAGE_ASSET_GRAPH_CONTRACT = "CREATIVE_IMAGE_ASSET_GRAPH_V1";

function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
function text(v){return String(v??"").trim();}
function lower(v){return text(v).toLowerCase();}

function identityKey(shot={}){
  return text(
    shot.subject_identity_key ||
    shot.identity_requirements?.profile_id ||
    shot.identity_requirements?.identity_profile_id ||
    shot.performance_contract?.identity_profile_id ||
    shot.generation?.identity_lock?.identity_profile_id ||
    shot.metadata?.identity_profile_id
  )||null;
}
function humanExpected(shot={}){
  return list(shot.actors).length>0 ||
    /man|woman|person|human|runner|performer|actor|face/i.test(
      [shot.subject,shot.action,shot.purpose].map(text).join(" ")
    );
}
function threatKey(shot={}){
  const moving=object(shot.environmental_continuity_state?.moving_threat_state);
  const pursuit=object(shot.pursuit_spatial_choreography);
  return text(
    shot.threat_identity_key ||
    moving.identity_key ||
    moving.threat_identity_key ||
    moving.threat_id ||
    moving.vehicle_id ||
    moving.id ||
    pursuit.threat_identity_key ||
    pursuit.threat_id ||
    pursuit.predator_id
  )||null;
}
function threatExpected(shot={}){
  const strategy=object(shot.generation_strategy);
  return strategy.complexity_factors?.moving_threat===true ||
    /drone|threat|pursu|hunt|predator/i.test([shot.subject,shot.action,shot.purpose].map(text).join(" "));
}
function environmentExpected(shot={}){
  return Boolean(
    object(shot.environmental_continuity_state).precipitation_state ||
    object(shot.environmental_continuity_state).atmosphere_density ||
    shot.production_design ||
    shot.location
  );
}
function transformationExpected(shot={}){
  const strategy=object(shot.generation_strategy);
  return strategy.complexity_factors?.transformation_vfx===true ||
    /transform|neural|logo|lightning|material shift|brain/i.test([shot.purpose,shot.action,shot.transition_out].map(text).join(" "));
}
function visualProductionMode(shot={}){
  return text(
    shot.production_route?.mode ||
    shot.visual_production_route?.mode ||
    shot.generation?.production_route?.mode ||
    shot.metadata?.visual_production_route?.mode
  ).toUpperCase();
}
function directAuthenticShot(shot={}){
  return visualProductionMode(shot)==="DIRECT_AUTHENTIC";
}
function videoShotExpected(shot={}){
  const capability=text(
    shot.generation?.capability ||
    shot.generation?.service ||
    shot.capability ||
    shot.service,
  ).toLowerCase();
  if(capability.startsWith("ai.video.")) return true;
  return ["CONTROLLED_SINGLE_PASS","SHARED_KEYFRAME_SEQUENCE","MULTIPASS_COMPLEX"].includes(
    text(shot.generation_strategy?.mode).toUpperCase()
  );
}
function sceneAuthorityEvidence(scene={},shots=[]){
  const sceneId=text(scene.id);
  const scoped=list(shots)
    .filter(s=>text(s.scene_id)===sceneId)
    .sort((a,b)=>Number(a.shot_number||0)-Number(b.shot_number||0))
    .map(s=>({
      shot_id:s.id||null,
      shot_number:Number(s.shot_number||0)||null,
      subject_identity_key:identityKey(s),
      threat_identity_key:threatKey(s),
      purpose:s.purpose||null,
      subject:s.subject||null,
      action:s.action||null,
      camera:object(s.camera),
      lighting:object(s.lighting),
      production_design:object(s.production_design),
      environmental_continuity_state:object(s.environmental_continuity_state),
      pursuit_spatial_choreography:object(s.pursuit_spatial_choreography),
      pursuit_performance_choreography:object(s.pursuit_performance_choreography),
      continuity_invariants:list(s.continuity_invariants),
      identity_requirements:object(s.identity_requirements),
      persistent_subject_lock:object(s.persistent_subject_lock),
    }));
  return {
    contract:"CREATIVE_IMAGE_SCENE_AUTHORITY_EVIDENCE_V1",
    scene_id:sceneId||null,
    shot_count:scoped.length,
    shots:scoped,
  };
}
function assetPrompt(assetClass,shot={},scene={}){
  const sharedSceneAsset=["CHARACTER_SHEET","THREAT_DESIGN","ENVIRONMENT_LOOKFRAME"].includes(assetClass);
  const sceneAuthority=object(scene.image_studio_scene_authority);
  const subjectKey=identityKey(shot);
  const governedThreatKey=threatKey(shot);
  const scopedSceneAuthority=
    assetClass==="CHARACTER_SHEET"&&subjectKey
      ?{
          ...sceneAuthority,
          shot_count:list(sceneAuthority.shots).filter(s=>text(s.subject_identity_key)===subjectKey).length,
          shots:list(sceneAuthority.shots).filter(s=>text(s.subject_identity_key)===subjectKey),
          subject_identity_key:subjectKey,
        }
      :assetClass==="THREAT_DESIGN"&&governedThreatKey
        ?{
            ...sceneAuthority,
            shot_count:list(sceneAuthority.shots).filter(s=>text(s.threat_identity_key)===governedThreatKey).length,
            shots:list(sceneAuthority.shots).filter(s=>text(s.threat_identity_key)===governedThreatKey),
            threat_identity_key:governedThreatKey,
          }
        :sceneAuthority;
  const common = [
    "Create a premium production asset for Avantiqo Image Studio.",
    "This is not a marketing mockup; it is upstream source material for governed cinema production.",
    "Reject generic AI aesthetics, plastic materials, default symmetry, synthetic skin, fake fog, decorative beams, game-camera framing and concept-art shortcuts.",
    "Preserve tactile realism, authored composition, physically credible lighting, material separation and downstream usability.",
    "Scene objective: "+text(scene.objective),
    "Shot purpose: "+text(shot.purpose),
    "Shot subject: "+text(shot.subject),
    "Action: "+text(shot.action),
    "Camera: "+JSON.stringify(object(shot.camera)),
    "Virtual camera state: "+JSON.stringify(object(shot.virtual_camera_state)),
    "Opening frame authority: "+JSON.stringify(object(shot.frame_plan).opening_frame||object(shot.opening_frame)),
    "Closing frame authority: "+JSON.stringify(object(shot.frame_plan).closing_frame||object(shot.closing_frame)),
    "Signature frame design: "+JSON.stringify(object(shot.signature_frame_design)),
    "Environmental continuity: "+JSON.stringify(object(shot.environmental_continuity_state)),
    "Subject motion choreography: "+JSON.stringify(object(shot.subject_motion_choreography)),
    "Pursuit spatial choreography: "+JSON.stringify(object(shot.pursuit_spatial_choreography)),
    "Performance choreography: "+JSON.stringify(object(shot.pursuit_performance_choreography)),
    "Editorial causality: "+JSON.stringify(object(shot.editorial_causality)),
    "Transition in: "+text(shot.transition_in),
    "Transition out: "+text(shot.transition_out),
    sharedSceneAsset
      ? "SCENE-WIDE AUTHORITY EVIDENCE: "+JSON.stringify(scopedSceneAuthority)
      : "",
  ];
  const specific={
    CHARACTER_SHEET:"Build a continuity-ready same-identity character sheet with front, 3/4 and profile evidence, consistent wardrobe/body proportions and neutral production lighting. No collage artifacts or duplicated people.",
    HERO_FRAME:"Build the exact authored opening/signature production frame for this shot, not a generic poster pose. The image must already contain the correct emotional beat, spatial threat relation, body state, geography, lens perspective and motivated light before motion begins. It must survive as world-class key art while remaining executable as frame zero of the planned action. Do not hide weak anatomy, contact, materials or composition behind implied future motion.",
    THREAT_DESIGN:"Design the governed threat/hero source with stable geometry and silhouette suitable for depth-aware VFX integration. Avoid decorative symmetry and generic sci-fi drone styling.",
    ENVIRONMENT_LOOKFRAME:"Build the authoritative environment lookframe: ecology, density, wetness, practical light, atmosphere, terrain and color separation must feel photographed, not procedurally repeated.",
    TRANSITION_LOOKFRAME:"Design a causal transformation stage that visibly connects matter, energy, geometry and brand resolution. No generic electric brain, neon network, random particles or logo pop-in.",
    VFX_SOURCE:"Create a clean, geometry-stable VFX source asset with strong silhouette and integration-friendly edges for downstream compositing.",
    COMPOSITING_SOURCE:"Create a compositing-ready source plate with clean separation, stable geometry and no baked decorative effects that belong downstream.",
    CONTINUITY_REFERENCE:"Create a continuity authority frame preserving exact subject/world/lighting state for neighboring shots.",
    STORYBOARD_FRAME:"Create a precise storyboard/keyframe communicating blocking, scale, geography and tension rather than polished generic beauty.",
    PERFORMANCE_REFERENCE:"Create a production performance reference for the exact governed character in this shot. Show the authored body mechanics, gaze, breath/exertion, fear/desire microexpression, posture asymmetry, fatigue/wetness carryover and next physical impulse. This is acting/body truth, not a fashion portrait or generic fear face.",
    CONTACT_DETAIL_REFERENCE:"Create a production interaction detail for the exact governed character/object and environment contact in this shot: hands, feet, mud, branch, ground, impact, grab, slip, fabric contact or other specified physical interaction. Show believable pressure, deformation, friction, weight transfer, surface response and causal consequence. No floating contact or staged product pose.",
  };
  return [...common,specific[assetClass]||""].filter(Boolean).join("\n");
}
function descriptor(assetClass,shot={},scene={}){
  const strategy=object(shot.generation_strategy);
  const continuityGroup=text(strategy.shared_state_group_id||scene.id||shot.scene_id);
  const subjectKey=identityKey(shot);
  const governedThreatKey=threatKey(shot);
  const scopeClass=
    assetClass==="CHARACTER_SHEET"&&subjectKey
      ?"SUBJECT"
      :assetClass==="THREAT_DESIGN"&&governedThreatKey
        ?"THREAT"
        :["CHARACTER_SHEET","THREAT_DESIGN","ENVIRONMENT_LOOKFRAME"].includes(assetClass)
          ?"SCENE"
          :"SHOT";
  const authority=CreativeImageAssetAuthorityRuntime.build({
    asset_class:assetClass,
    scene_id:scene.id||shot.scene_id||null,
    shot_id:scopeClass==="SHOT"?shot.id:null,
    continuity_group_id:continuityGroup||null,
    downstream_roles:
      assetClass==="VFX_SOURCE"||assetClass==="THREAT_DESIGN"
        ? ["VIDEO","VFX","COMPOSITING"]
        : assetClass==="COMPOSITING_SOURCE"||assetClass==="TRANSITION_LOOKFRAME"
          ? ["VIDEO","COMPOSITING"]
          : ["VIDEO"],
    identity_lock_required:assetClass==="CHARACTER_SHEET"||humanExpected(shot),
    approved_for_video_source:true,
    approved_for_vfx_source:["THREAT_DESIGN","VFX_SOURCE"].includes(assetClass),
    approved_for_compositing_source:["THREAT_DESIGN","VFX_SOURCE","COMPOSITING_SOURCE","TRANSITION_LOOKFRAME"].includes(assetClass),
  });
  const sceneScope=scene.id||shot.scene_id||"scene";
  const scopeId=
    scopeClass==="SUBJECT"
      ?sceneScope+":"+subjectKey
      :scopeClass==="THREAT"
        ?sceneScope+":"+governedThreatKey
        :scopeClass==="SCENE"
          ?sceneScope
          :(shot.id||"shot");
  return {assetClass,scopeClass,scopeId,authority,prompt:assetPrompt(assetClass,shot,scene)};
}
function explorationVariants(assetClass){
  const variants={
    HERO_FRAME:[
      {id:"A",axis:"COMPOSITION",instruction:"Explore an asymmetric layered composition with strong foreground occlusion, readable emotional focal point and premium negative space. Preserve all identity/world locks exactly."},
      {id:"B",axis:"LIGHTING",instruction:"Explore the same identity/world with a stronger continuity-valid motivated lighting hierarchy. Do not invent a new time of day, practical source, weather state or lighting event; preserve geometry, wardrobe, environment and threat design exactly."},
      {id:"C",axis:"SPATIAL_PRESSURE",instruction:"Explore stronger authored spatial pressure using only continuity-valid lens choice, foreground occlusion and blocking. Preserve the planned axis, geography, identity, world design, threat distance logic and all physical continuity exactly."},
    ],
    THREAT_DESIGN:[
      {id:"A",axis:"SILHOUETTE",instruction:"Explore a distinctive predatory silhouette while preserving the governed threat identity and mechanical logic."},
      {id:"B",axis:"MATERIAL_LANGUAGE",instruction:"Explore a materially richer surface/lighting treatment without changing proportions, identity or functional geometry."},
      {id:"C",axis:"THREAT_READ",instruction:"Explore a stronger readable threat posture/search-light relationship without decorative symmetry or geometry drift."},
    ],
    ENVIRONMENT_LOOKFRAME:[
      {id:"A",axis:"DEPTH",instruction:"Explore deeper layered environmental staging and foreground/midground/background separation without changing the world identity."},
      {id:"B",axis:"ATMOSPHERE",instruction:"Explore a physically different but continuity-valid atmosphere/light interaction while preserving ecology, terrain and practical-light authority."},
      {id:"C",axis:"GRAPHIC_STRUCTURE",instruction:"Explore stronger graphic silhouette and negative-space design while preserving the same location/world contract."},
    ],
    TRANSITION_LOOKFRAME:[
      {id:"A",axis:"MATERIAL_CAUSALITY",instruction:"Explore transformation through physical material response first, then energy structure, without generic particles or logo pop-in."},
      {id:"B",axis:"GEOMETRIC_CAUSALITY",instruction:"Explore transformation through disciplined geometry emerging from the established material world, preserving brand logic."},
      {id:"C",axis:"LIGHT_CAUSALITY",instruction:"Explore transformation through motivated light propagation and silhouette evolution, not decorative neon effects."},
    ],
  };
  return variants[assetClass]||[{id:"A",axis:"CANONICAL",instruction:"Generate the single governed canonical asset."}];
}
function materialTruthKeys(shot={},scene={}){
  const source=[
    shot.subject,shot.action,shot.purpose,shot.location,
    JSON.stringify(object(shot.production_design)),
    JSON.stringify(object(shot.environmental_continuity_state)),
    JSON.stringify(object(shot.lighting)),
    JSON.stringify(object(shot.pursuit_spatial_choreography)),
    JSON.stringify(object(scene)),
  ].map(text).join(" ").toLowerCase();
  const keys=[];
  const wet=/rain|wet|storm|mist|fog|water|soak|drench/.test(source);
  const human=humanExpected(shot);
  const threat=threatExpected(shot);
  if(human&&wet) keys.push("WET_SKIN","WET_FABRIC");
  if(/forest|tree|bark|wood|branch|foliage/.test(source)) keys.push(wet?"WET_BARK":"BARK");
  if(/mud|muddy|ground|soil|dirt|footprint|splash/.test(source)) keys.push(wet?"WET_MUD_GROUND":"GROUND");
  if(threat||/metal|vehicle|drone|machine|hardware/.test(source)) keys.push(wet?"WET_METAL":"METAL");
  if(/glass|window|lens|headlamp|visor/.test(source)) keys.push(wet?"WET_GLASS":"GLASS");
  if(/search.?light|beam|spotlight/.test(source)&&/rain|mist|fog|haze/.test(source)) keys.push("SEARCHLIGHT_ATMOSPHERE_INTERACTION");
  return [...new Set(keys)];
}
function contactDetailExpected(shot={}){
  const source=[
    shot.subject,shot.action,shot.purpose,
    JSON.stringify(object(shot.pursuit_performance_choreography)),
    JSON.stringify(object(shot.environmental_continuity_state)),
  ].map(text).join(" ").toLowerCase();
  return /hand|feet|foot|boot|mud|ground|branch|grab|slip|stumble|impact|contact|collision|fall|duck|jump|land|water|debris|cloth|fabric/.test(source);
}
function requiredAssets(shot={},scene={}){
  const strategy=object(shot.generation_strategy);
  const out=[];
  if(videoShotExpected(shot)){
    out.push("HERO_FRAME");
  }
  if(humanExpected(shot)) out.push("CHARACTER_SHEET","PERFORMANCE_REFERENCE");
  if(humanExpected(shot)&&contactDetailExpected(shot)) out.push("CONTACT_DETAIL_REFERENCE");
  if(environmentExpected(shot)) out.push("ENVIRONMENT_LOOKFRAME");
  if(threatExpected(shot)) out.push("THREAT_DESIGN");
  if(transformationExpected(shot)) out.push("TRANSITION_LOOKFRAME","COMPOSITING_SOURCE");
  return [...new Set(out)];
}
function addEdge(edges,edge){
  const key=[edge.from,edge.to,edge.type].join("::");
  if(!edges.some(e=>[e.from,e.to,e.type].join("::")===key)) edges.push(edge);
}

function bindExistingVisualDerivedAsHero(node,{d,shot,scene,shotNode,imageCameraAuthority,explorationGroupId,variant,graph}={}){
  node.intent={
    ...object(node.intent),
    scene_id:scene.id||shot.scene_id||null,
    shot_id:shot.id||null,
    asset_class:"HERO_FRAME",
    purpose:shot.purpose||node.intent?.purpose||"",
  };
  node.requirements={
    ...object(node.requirements),
    story_lineage:
      shotNode.metadata?.story_lineage ||
      shotNode.story_lineage ||
      graph.metadata?.story_lineage ||
      null,
    image_asset_authority:d.authority,
    asset_class:"HERO_FRAME",
    continuity_group_id:d.authority.continuity_group_id,
    subject:shot.subject||node.requirements?.subject||"",
    action:shot.action||node.requirements?.action||"",
    camera:object(shot.camera),
    lighting:object(shot.lighting),
    production_design:object(shot.production_design),
    signature_frame_design:object(shot.signature_frame_design),
    identity_requirements:object(shot.identity_requirements),
    identity_atlas_asset_node_id:
      shot.identity_requirements?.identity_atlas_asset_node_id ||
      shot.keyframe_contract?.identity_atlas_asset_node_id ||
      null,
    identity_atlas_url:
      shot.identity_requirements?.identity_atlas_url ||
      shot.keyframe_contract?.identity_atlas_url ||
      null,
    identity_atlas_hash:
      shot.identity_requirements?.identity_atlas_hash ||
      shot.keyframe_contract?.identity_atlas_hash ||
      null,
    persistent_subject_lock:object(shot.persistent_subject_lock),
    world_consistency_contract:object(shot.world_consistency_contract),
    image_camera_authority:imageCameraAuthority,
    actors:list(shot.actors),
    reject_before_motion_generation:true,
    image_asset_exploration:explorationGroupId?{
      contract:"CREATIVE_IMAGE_DESIGN_EXPLORATION_V1",
      exploration_group_id:explorationGroupId,
      variation_id:variant.id,
      variation_axis:variant.axis,
      identity_world_mutation_forbidden:true,
      selection_required:true,
    }:null,
  };
  node.generation={
    ...object(node.generation),
    provider:null,
    provider_prompt:[
      d.prompt,
      explorationGroupId?("CONTROLLED DESIGN EXPLORATION VARIANT "+variant.id+" · "+variant.axis+": "+variant.instruction):"",
    ].filter(Boolean).join("\n"),
    provider_parameters:{
      ...object(node.generation?.provider_parameters),
      input_fidelity:"high",
      production_asset_generation:true,
      asset_class:"HERO_FRAME",
      continuity_group_id:d.authority.continuity_group_id,
      image_camera_authority:imageCameraAuthority,
      identity_atlas_asset_node_id:
        shot.identity_requirements?.identity_atlas_asset_node_id ||
        shot.keyframe_contract?.identity_atlas_asset_node_id ||
        null,
      identity_atlas_url:
        shot.identity_requirements?.identity_atlas_url ||
        shot.keyframe_contract?.identity_atlas_url ||
        null,
      identity_atlas_hash:
        shot.identity_requirements?.identity_atlas_hash ||
        shot.keyframe_contract?.identity_atlas_hash ||
        null,
      persistent_subject_lock:object(shot.persistent_subject_lock),
      world_consistency_contract:object(shot.world_consistency_contract),
      reference_asset_ids:list(shot.reference_asset_ids),
      exploration_group_id:explorationGroupId,
      variation_id:variant.id,
      variation_axis:variant.axis,
      controlled_variation_instruction:variant.instruction,
      identity_world_mutation_forbidden:true,
    },
  };
  node.metadata={
    ...object(node.metadata),
    image_asset_graph_contract:CREATIVE_IMAGE_ASSET_GRAPH_CONTRACT,
    image_asset_class:"HERO_FRAME",
    image_asset_exploration_group_id:explorationGroupId,
    image_asset_variation_id:variant.id,
    image_asset_variation_axis:variant.axis,
    image_camera_authority_contract:imageCameraAuthority?.contract||null,
    image_camera_authority_hash:imageCameraAuthority?.authority_hash||null,
    visual_derived_frame_reused_as_image_studio_hero:true,
  };
  return node;
}

export const CreativeImageAssetGraphRuntime = {
  apply({graph,shots=[],scenes=[]}={}){
    if(!graph) throw new Error("production graph required");
    const nodes=[...list(graph.nodes)];
    const edges=[...list(graph.edges)];
    const sceneMap=new Map(list(scenes).map(s=>[
      text(s.id),
      {
        ...s,
        image_studio_scene_authority:sceneAuthorityEvidence(s,shots),
      },
    ]));
    const shotMap=new Map(list(shots).map(s=>[text(s.id),s]));
    const inserted=[];
    for(const shotNode of nodes.filter(n=>text(n.type).toUpperCase()==="SHOT")){
      const shot=shotMap.get(text(shotNode.id));
      if(!shot) continue;
      const scene=sceneMap.get(text(shot.scene_id||shotNode.metadata?.scene_id))||{};
      for(const assetClass of requiredAssets(shot,scene)){
        const d=descriptor(assetClass,shot,scene);
        const imageCameraAuthority=["HERO_FRAME","CONTINUITY_REFERENCE","STORYBOARD_FRAME"].includes(assetClass)
          ? CreativeImageCameraAuthorityRuntime.build({shot})
          : null;
        const variants=
          assetClass==="HERO_FRAME"&&directAuthenticShot(shot)
            ?[{id:"A",axis:"AUTHENTIC_SOURCE",instruction:"Promote the exact approved authentic source as Image Studio hero authority. Do not generate, redraw, relight, crop, restage or alter source pixels."}]
            :explorationVariants(assetClass);
        const explorationGroupId=variants.length>1
          ? `image-exploration:${d.scopeId}:${assetClass.toLowerCase()}`
          : null;
        for(const variant of variants){
          const suffix=variants.length>1?`:${variant.id.toLowerCase()}`:"";
          const nodeId=`image-asset:${d.scopeId}:${assetClass.toLowerCase()}${suffix}`;
          const reusableVisualDerivedHero=
            assetClass==="HERO_FRAME" &&
            variant.id==="A"
              ? nodes.find(n=>text(n.id)===`${shot.id}:visual-derived-frame`)
              : null;
          let assetNode=reusableVisualDerivedHero||nodes.find(n=>text(n.id)===nodeId);
          if(reusableVisualDerivedHero){
            assetNode=bindExistingVisualDerivedAsHero(reusableVisualDerivedHero,{
              d,shot,scene,shotNode,imageCameraAuthority,explorationGroupId,variant,graph,
            });
            inserted.push({
              node_id:assetNode.id,
              asset_class:assetClass,
              scope_id:d.scopeId,
              variation_id:variant.id,
              reused_visual_derived_frame:true,
            });
          }else if(!assetNode){
            assetNode=createProductionNode({
            id:nodeId,
            type:"IMAGE_ASSET",
            title:`${assetClass.replaceAll("_"," ")} · ${d.scopeId}`,
            description:"Governed Image Studio source asset for downstream video/VFX/compositing.",
            priority:Math.max(0,Number(shotNode.priority||100)-4),
            intent:{
              scene_id:scene.id||shot.scene_id||null,
              shot_id:d.scopeClass==="SHOT"?shot.id:null,
              asset_class:assetClass,
              purpose:shot.purpose||"",
            },
            requirements:{
              story_lineage:
                shotNode.metadata?.story_lineage ||
                shotNode.story_lineage ||
                graph.metadata?.story_lineage ||
                null,
              image_asset_authority:d.authority,
              asset_class:assetClass,
              continuity_group_id:d.authority.continuity_group_id,
              subject:shot.subject||"",
              action:shot.action||"",
              camera:object(shot.camera),
              lighting:object(shot.lighting),
              production_design:object(shot.production_design),
              signature_frame_design:object(shot.signature_frame_design),
              identity_requirements:object(shot.identity_requirements),
              subject_identity_key:identityKey(shot),
              identity_profile_id:
                shot.identity_requirements?.profile_id ||
                shot.identity_requirements?.identity_profile_id ||
                shot.performance_contract?.identity_profile_id ||
                null,
              identity_atlas_asset_node_id:
                shot.identity_requirements?.identity_atlas_asset_node_id ||
                shot.keyframe_contract?.identity_atlas_asset_node_id ||
                null,
              identity_atlas_url:
                shot.identity_requirements?.identity_atlas_url ||
                shot.keyframe_contract?.identity_atlas_url ||
                null,
              identity_atlas_hash:
                shot.identity_requirements?.identity_atlas_hash ||
                shot.keyframe_contract?.identity_atlas_hash ||
                null,
              persistent_subject_lock:object(shot.persistent_subject_lock),
              world_consistency_contract:object(shot.world_consistency_contract),
              image_camera_authority:imageCameraAuthority,
              actors:list(shot.actors),
              output_spec:{width:2048,height:1152,aspect_ratio:"16:9"},
              reject_before_motion_generation:true,
              image_asset_exploration:explorationGroupId?{
                contract:"CREATIVE_IMAGE_DESIGN_EXPLORATION_V1",
                exploration_group_id:explorationGroupId,
                variation_id:variant.id,
                variation_axis:variant.axis,
                identity_world_mutation_forbidden:true,
                selection_required:true,
              }:null,
            },
            assets:[
              ...new Set([
                ...(assetClass==="HERO_FRAME"&&directAuthenticShot(shot)
                  ?[shot.primary_source_asset_id]
                  :[]),
                ...(["CHARACTER_SHEET","THREAT_DESIGN","ENVIRONMENT_LOOKFRAME"].includes(assetClass)&&shot.primary_source_asset_id
                  ?[shot.primary_source_asset_id]
                  :[]),
                ...list(shot.reference_asset_ids),
              ].filter(Boolean)),
            ],
            generation:{
              required:true,
              service:
                assetClass==="HERO_FRAME"&&directAuthenticShot(shot)
                  ?"creative.image.authentic-source-promote"
                  :"ai.image.generate",
              capability:
                assetClass==="HERO_FRAME"&&directAuthenticShot(shot)
                  ?"creative.image.authentic-source-promote"
                  :"ai.image.generate",
              provider:null,
              provider_prompt:
                assetClass==="HERO_FRAME"&&directAuthenticShot(shot)
                  ?null
                  :[d.prompt,explorationGroupId?`CONTROLLED DESIGN EXPLORATION VARIANT ${variant.id} · ${variant.axis}: ${variant.instruction}`:""].filter(Boolean).join("\n"),
              primary_source_asset_id:
                assetClass==="HERO_FRAME"&&directAuthenticShot(shot)
                  ?shot.primary_source_asset_id||null
                  :null,
              production_route:
                assetClass==="HERO_FRAME"&&directAuthenticShot(shot)
                  ?object(shot.production_route||shot.visual_production_route||shot.generation?.production_route)
                  :null,
              provider_parameters:{
                input_fidelity:"high",
                production_asset_generation:
                  !(assetClass==="HERO_FRAME"&&directAuthenticShot(shot)),
                authentic_source_promotion:
                  assetClass==="HERO_FRAME"&&directAuthenticShot(shot),
                exact_source_pixels_preserved:
                  assetClass==="HERO_FRAME"&&directAuthenticShot(shot),
                primary_source_asset_id:
                  assetClass==="HERO_FRAME"&&directAuthenticShot(shot)
                    ?shot.primary_source_asset_id||null
                    :null,
                visual_production_route:
                  assetClass==="HERO_FRAME"&&directAuthenticShot(shot)
                    ?object(shot.production_route||shot.visual_production_route||shot.generation?.production_route)
                    :null,
                asset_class:assetClass,
                continuity_group_id:d.authority.continuity_group_id,
                identity_atlas_asset_node_id:
                  shot.identity_requirements?.identity_atlas_asset_node_id ||
                  shot.keyframe_contract?.identity_atlas_asset_node_id ||
                  null,
                identity_atlas_url:
                  shot.identity_requirements?.identity_atlas_url ||
                  shot.keyframe_contract?.identity_atlas_url ||
                  null,
                identity_atlas_hash:
                  shot.identity_requirements?.identity_atlas_hash ||
                  shot.keyframe_contract?.identity_atlas_hash ||
                  null,
                persistent_subject_lock:object(shot.persistent_subject_lock),
                threat_identity_key:threatKey(shot),
                world_consistency_contract:object(shot.world_consistency_contract),
                image_camera_authority:imageCameraAuthority,
                reference_asset_ids:list(shot.reference_asset_ids),
                exploration_group_id:explorationGroupId,
                variation_id:variant.id,
                variation_axis:variant.axis,
                controlled_variation_instruction:variant.instruction,
                identity_world_mutation_forbidden:true,
              },
              output_spec:{width:2048,height:1152,aspect_ratio:"16:9"},
              estimated_cost:0,
              estimated_seconds:0,
              status:"WAITING",
            },
            metadata:{
              workflow_kind:graph.metadata?.workflow_kind||"TEMPORAL",
              story_lineage:
                shotNode.metadata?.story_lineage ||
                shotNode.story_lineage ||
                graph.metadata?.story_lineage ||
                null,
              scene_id:scene.id||shot.scene_id||null,
              shot_id:d.scopeClass==="SHOT"?shot.id:null,
              contract:CREATIVE_IMAGE_ASSET_GRAPH_CONTRACT,
              image_asset_class:assetClass,
              image_asset_exploration_group_id:explorationGroupId,
              image_asset_variation_id:variant.id,
              image_asset_variation_axis:variant.axis,
              subject_identity_key:identityKey(shot),
              identity_profile_id:
                shot.identity_requirements?.profile_id ||
                shot.identity_requirements?.identity_profile_id ||
                shot.performance_contract?.identity_profile_id ||
                null,
              image_camera_authority_contract:imageCameraAuthority?.contract||null,
              image_camera_authority_hash:imageCameraAuthority?.authority_hash||null,
              authentic_source_promotion:
                assetClass==="HERO_FRAME"&&directAuthenticShot(shot),
              primary_source_asset_id:
                assetClass==="HERO_FRAME"&&directAuthenticShot(shot)
                  ?shot.primary_source_asset_id||null
                  :null,
            },
          });
          nodes.push(assetNode);
          inserted.push({node_id:nodeId,asset_class:assetClass,scope_id:d.scopeId,variation_id:variant.id});
        }
        addEdge(edges,createProductionEdge({from:assetNode.id,to:shotNode.id,type:"DEPENDS_ON"}));
        }
      }
    }
    return {
      ...graph,
      nodes,
      edges,
      metadata:{
        ...object(graph.metadata),
        image_asset_graph_contract:CREATIVE_IMAGE_ASSET_GRAPH_CONTRACT,
        image_asset_node_count:inserted.length,
        image_studio_is_upstream_asset_authority:true,
      },
    };
  },
};

export const CreativeImageAssetGraphContract = Object.freeze({
  contract:CREATIVE_IMAGE_ASSET_GRAPH_CONTRACT,
});
