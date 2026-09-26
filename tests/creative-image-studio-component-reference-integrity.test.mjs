import test from "node:test";
import assert from "node:assert/strict";
import { buildImageStudioComponentDefinition, instantiateImageStudioComponent } from "../lib/creative/stills/runtime/CreativeImageStudioReusableDesignRuntime.js";

function ids(){
  let index=0;
  return ()=>`new-${++index}`;
}

test("component instances remap clip-mask references to fresh internal ids",()=>{
  const layers=[
    {id:"image",artboard_id:"board",layer_type:"IMAGE",bounds:{x:10,y:20,width:200,height:100},metadata:{clip_mask_layer_id:"mask"}},
    {id:"mask",artboard_id:"board",layer_type:"MASK",bounds:{x:20,y:30,width:100,height:80},metadata:{is_clip_mask:true,clip_mask_target_id:"image"}},
  ];
  const definition=buildImageStudioComponentDefinition(layers,["image","mask"],{id:"component"});
  const instance=instantiateImageStudioComponent(definition,{artboard_id:"other",idFactory:ids()});
  const image=instance.find(layer=>layer.layer_type==="IMAGE");
  const mask=instance.find(layer=>layer.layer_type==="MASK");
  assert.equal(image.metadata.clip_mask_layer_id,mask.id);
  assert.equal(mask.metadata.clip_mask_target_id,image.id);
  assert.notEqual(image.metadata.clip_mask_layer_id,"mask");
});

test("component instances remap adjustment targets mask and owner",()=>{
  const layers=[
    {id:"image",artboard_id:"board",layer_type:"IMAGE",bounds:{x:0,y:0,width:100,height:100},metadata:{}},
    {id:"adjust",artboard_id:"board",layer_type:"ADJUSTMENT",bounds:{x:0,y:0,width:100,height:100},metadata:{adjustment_target_layer_ids:["image"],adjustment_mask_layer_id:"mask"}},
    {id:"mask",artboard_id:"board",layer_type:"MASK",bounds:{x:0,y:0,width:50,height:100},metadata:{adjustment_mask_owner_id:"adjust",clip_mask_target_id:"image"}},
  ];
  const definition=buildImageStudioComponentDefinition(layers,layers.map(layer=>layer.id),{id:"component"});
  const instance=instantiateImageStudioComponent(definition,{artboard_id:"other",idFactory:ids()});
  const image=instance.find(layer=>layer.layer_type==="IMAGE");
  const adjustment=instance.find(layer=>layer.layer_type==="ADJUSTMENT");
  const mask=instance.find(layer=>layer.layer_type==="MASK");
  assert.deepEqual(adjustment.metadata.adjustment_target_layer_ids,[image.id]);
  assert.equal(adjustment.metadata.adjustment_mask_layer_id,mask.id);
  assert.equal(mask.metadata.adjustment_mask_owner_id,adjustment.id);
  assert.equal(mask.metadata.clip_mask_target_id,image.id);
});

test("component definition drops references that point outside selection",()=>{
  const layers=[
    {id:"image",artboard_id:"board",layer_type:"IMAGE",bounds:{x:0,y:0,width:100,height:100},metadata:{clip_mask_layer_id:"outside"}},
    {id:"adjust",artboard_id:"board",layer_type:"ADJUSTMENT",bounds:{x:0,y:0,width:100,height:100},metadata:{adjustment_target_layer_ids:["image","outside"],adjustment_mask_layer_id:"outside"}},
  ];
  const definition=buildImageStudioComponentDefinition(layers,["image","adjust"],{id:"component"});
  assert.equal(definition.layers[0].metadata.clip_mask_layer_id,null);
  assert.deepEqual(definition.layers[1].metadata.adjustment_target_layer_ids,["image"]);
  assert.equal(definition.layers[1].metadata.adjustment_mask_layer_id,null);
});

test("component instances preserve internal logical group parent relationships",()=>{
  const layers=[
    {id:"a",artboard_id:"board",parent_layer_id:"group",layer_type:"TEXT",bounds:{x:10,y:10,width:100,height:20},metadata:{}},
    {id:"b",artboard_id:"board",parent_layer_id:"group",layer_type:"TEXT",bounds:{x:10,y:40,width:100,height:20},metadata:{}},
    {id:"group",artboard_id:"board",parent_layer_id:null,layer_type:"GROUP",bounds:{x:0,y:0,width:120,height:80},metadata:{}},
  ];
  const definition=buildImageStudioComponentDefinition(layers,["a","b","group"],{id:"component"});
  const instance=instantiateImageStudioComponent(definition,{artboard_id:"other",idFactory:ids()});
  const group=instance.find(layer=>layer.layer_type==="GROUP");
  const children=instance.filter(layer=>layer.layer_type==="TEXT");
  assert.ok(children.every(layer=>layer.parent_layer_id===group.id));
});
