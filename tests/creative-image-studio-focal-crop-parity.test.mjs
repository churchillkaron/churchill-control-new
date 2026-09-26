import test from "node:test";
import assert from "node:assert/strict";
import { imageStudioSourceCropGeometry, imageStudioPreviewGeometry } from "../lib/creative/stills/runtime/CreativeImageStudioImageGeometryRuntime.js";

function focalFramePosition(geometry){
  return {
    x:geometry.focalX*geometry.renderedWidth-(geometry.coverLeft+geometry.extractLeft),
    y:geometry.focalY*geometry.renderedHeight-(geometry.coverTop+geometry.extractTop),
  };
}

test("off-center focal point is applied once across cover and zoom crop",()=>{
  const layer={bounds:{x:0,y:0,width:400,height:400},metadata:{crop:{x:.75,y:.5,zoom:1.5}}};
  const geometry=imageStudioSourceCropGeometry(layer,{width:1600,height:900});
  assert.equal(geometry.renderedWidth,1067);
  assert.equal(geometry.renderedHeight,600);
  assert.equal(geometry.totalLeft,600);
  assert.equal(geometry.coverLeft,467);
  assert.equal(geometry.extractLeft,133);
  assert.equal(geometry.totalTop,100);
  assert.equal(geometry.coverTop,0);
  assert.equal(geometry.extractTop,100);
  const focal=focalFramePosition(geometry);
  assert.ok(Math.abs(focal.x-200.25)<.001);
  assert.equal(focal.y,200);
});

test("increasing zoom does not add focal drift once both axes are centerable",()=>{
  const source={width:1600,height:900};
  const a=imageStudioSourceCropGeometry({bounds:{x:0,y:0,width:400,height:400},metadata:{crop:{x:.65,y:.4,zoom:1.5}}},source);
  const b=imageStudioSourceCropGeometry({bounds:{x:0,y:0,width:400,height:400},metadata:{crop:{x:.65,y:.4,zoom:2.4}}},source);
  const pa=focalFramePosition(a),pb=focalFramePosition(b);
  assert.ok(Math.abs(pa.x-200)<1);
  assert.ok(Math.abs(pa.y-200)<1);
  assert.ok(Math.abs(pb.x-200)<1);
  assert.ok(Math.abs(pb.y-200)<1);
  assert.ok(Math.abs(pa.x-pb.x)<1);
  assert.ok(Math.abs(pa.y-pb.y)<1);
});

test("edge focal points clamp without invalid extraction windows",()=>{
  for(const x of [0,1])for(const y of [0,1]){
    const geometry=imageStudioSourceCropGeometry({bounds:{width:333,height:211},metadata:{crop:{x,y,zoom:3.2}}},{width:1920,height:1080});
    assert.ok(geometry.coverLeft>=0&&geometry.coverLeft<=geometry.renderedWidth-geometry.scaledWidth);
    assert.ok(geometry.coverTop>=0&&geometry.coverTop<=geometry.renderedHeight-geometry.scaledHeight);
    assert.ok(geometry.extractLeft>=0&&geometry.extractLeft<=geometry.scaledWidth-geometry.width);
    assert.ok(geometry.extractTop>=0&&geometry.extractTop<=geometry.scaledHeight-geometry.height);
    assert.equal(geometry.coverLeft+geometry.extractLeft,geometry.totalLeft);
    assert.equal(geometry.coverTop+geometry.extractTop,geometry.totalTop);
  }
});

test("preview uses the corrected total crop offset",()=>{
  const layer={bounds:{x:0,y:0,width:400,height:400},metadata:{crop:{x:.75,y:.5,zoom:1.5}}};
  const preview=imageStudioPreviewGeometry(layer,{width:1600,height:900},.5);
  assert.equal(preview.image.left,-300);
  assert.equal(preview.image.top,-50);
  assert.equal(preview.image.width,533.5);
  assert.equal(preview.image.height,300);
});
