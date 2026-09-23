import assert from "node:assert/strict";
import test from "node:test";
import {
  compileImageGenerationReferences,
} from "../lib/creative/image/runtime/CreativeImageGenerationReferenceCompilerRuntime.js";

function ref(role,id){
  return {url:"storage://ref/"+id,role,asset_node_id:id};
}

function taskWithReferences(source_assets,requirements={}){
  return {
    capability:"ai.image.generate",
    metadata:{contract:"CREATIVE_IMAGE_TEST_V1"},
    input:{
      source_assets,
      requirements:{
        image_asset_authority:{contract:"CREATIVE_IMAGE_ASSET_AUTHORITY_V1"},
        ...requirements,
      },
    },
  };
}

test("generation compiler exports a valid contract and passes normal governed references",()=>{
  const result=compileImageGenerationReferences({
    task:taskWithReferences([
      ref("IMAGE_STUDIO_FOUNDATION_CHARACTER","character"),
      ref("IMAGE_STUDIO_FOUNDATION_ENVIRONMENT","environment"),
    ],{
      image_foundation_authority:{
        character_asset_node_id:"character",
        environment_asset_node_id:"environment",
      },
    }),
  });
  assert.equal(result.contract,"CREATIVE_IMAGE_GENERATION_REFERENCE_COMPILER_V1");
  assert.equal(result.required,true);
  assert.equal(result.passed,true);
  assert.deepEqual(result.missing_required_authority_groups,[]);
});

test("generation compiler fails closed if a forced tiny budget drops required foundation authority",()=>{
  const result=compileImageGenerationReferences({
    max_references:1,
    task:taskWithReferences([
      ref("IMAGE_STUDIO_FOUNDATION_CHARACTER","character"),
      ref("IMAGE_STUDIO_FOUNDATION_THREAT","threat"),
      ref("IMAGE_STUDIO_FOUNDATION_ENVIRONMENT","environment"),
    ],{
      image_foundation_authority:{
        character_asset_node_id:"character",
        threat_asset_node_id:"threat",
        environment_asset_node_id:"environment",
      },
    }),
  });
  assert.equal(result.passed,false);
  assert.ok(result.missing_required_authority_groups.length>=2);
});

test("material truth generation requires at least one scoped material source reference",()=>{
  const result=compileImageGenerationReferences({
    max_references:1,
    task:{
      capability:"ai.image.generate",
      metadata:{
        contract:"CREATIVE_IMAGE_MATERIAL_TRUTH_PACK_V1",
        material_truth_reference:true,
      },
      input:{
        source_assets:[
          ref("IMAGE_STUDIO_FOUNDATION_ENVIRONMENT","environment"),
          ref("MATERIAL_TRUTH_SOURCE_THREAT_DESIGN","threat-material"),
        ],
        requirements:{
          image_asset_authority:{contract:"CREATIVE_IMAGE_ASSET_AUTHORITY_V1"},
          material_truth_reference:{
            physical_surface_authority:true,
          },
        },
      },
    },
  });
  assert.equal(result.passed,false);
  assert.ok(result.missing_required_authority_groups.includes("MATERIAL_TRUTH_SOURCE"));
});

test("semantic source and mask are reserved outside the reference budget",()=>{
  const result=compileImageGenerationReferences({
    task:{
      capability:"ai.image.inpaint",
      metadata:{
        contract:"CREATIVE_IMAGE_LOCALIZED_REPAIR_V1",
        image_asset_localized_repair:true,
      },
      input:{
        source_image:"storage://source/master",
        mask_image:"storage://source/mask",
        source_assets:[
          ref("SOURCE_AUTHORITY","master"),
          ref("IMAGE_STUDIO_FOUNDATION_CHARACTER","character"),
        ],
        requirements:{
          image_asset_authority:{contract:"CREATIVE_IMAGE_ASSET_AUTHORITY_V1"},
        },
      },
    },
  });
  assert.equal(result.semantic_reserved_count,2);
  assert.ok(result.selected_reference_count<=10);
  assert.equal(result.provider_transport_safe,true);
});
