import test from "node:test";
import assert from "node:assert/strict";
import { measureImageStudioText } from "../lib/creative/stills/runtime/CreativeImageStudioTypographyRuntime.js";

const graphemes=(value)=>[...new Intl.Segmenter("und",{granularity:"grapheme"}).segment(value)].map(item=>item.segment);

test("typography never splits ZWJ emoji grapheme clusters",()=>{
  const family="👨‍👩‍👧‍👦";
  const text=family.repeat(3);
  const measured=measureImageStudioText({text,bounds:{width:20,height:200},style:{font_size:20,line_height:1}});
  assert.equal(measured.lines.join(""),text);
  assert.deepEqual(measured.lines,[family,family,family]);
  assert.ok(measured.lines.every(line=>graphemes(line).length===1));
});

test("typography preserves combining-mark graphemes across hard wraps",()=>{
  const cluster="e\u0301";
  const text=cluster.repeat(5);
  const measured=measureImageStudioText({text,bounds:{width:24,height:200},style:{font_size:20,line_height:1}});
  assert.equal(measured.lines.join(""),text);
  assert.deepEqual(measured.lines.map(line=>graphemes(line).length),[2,2,1]);
  assert.ok(measured.lines.every(line=>!/^\p{M}/u.test(line)));
});

test("Thai text wraps without inserted spaces or broken grapheme clusters",()=>{
  const text="สวัสดีประเทศไทย";
  const measured=measureImageStudioText({text,bounds:{width:34,height:300},style:{font_size:20,line_height:1}});
  assert.equal(measured.lines.join(""),text);
  assert.ok(measured.lines.length>1);
  assert.ok(measured.lines.every(line=>graphemes(line).length<=3));
  assert.ok(measured.lines.every(line=>!/^\p{M}/u.test(line)));
});

test("ordinary spaced Latin wrapping keeps existing single-space behavior",()=>{
  const measured=measureImageStudioText({text:"alpha   beta gamma",bounds:{width:65,height:200},style:{font_size:20,line_height:1}});
  assert.equal(measured.lines.join(" "),"alpha beta gamma");
  assert.ok(measured.lines.every(line=>graphemes(line).length<=6));
});

test("explicit newlines remain authoritative with Unicode wrapping",()=>{
  const measured=measureImageStudioText({text:"สวัสดี\n👩🏽‍💻",bounds:{width:200,height:200},style:{font_size:20,line_height:1}});
  assert.equal(measured.lines[0],"สวัสดี");
  assert.equal(measured.lines[1],"👩🏽‍💻");
});

test("wide emoji graphemes consume approximately one em of line width",()=>{
  const measured=measureImageStudioText({text:"🙂🙂",bounds:{width:20,height:100},style:{font_size:20,line_height:1}});
  assert.deepEqual(measured.lines,["🙂","🙂"]);
  assert.ok(measured.lineWidths.every(width=>width>=19.9&&width<=20.1));
});

test("CJK full-width text wraps by rendered-width estimate rather than Latin average width",()=>{
  const measured=measureImageStudioText({text:"東京大阪",bounds:{width:40,height:120},style:{font_size:20,line_height:1}});
  assert.deepEqual(measured.lines,["東京","大阪"]);
  assert.deepEqual(measured.lineWidths,[40,40]);
});

test("narrow and wide Latin glyphs receive different deterministic width estimates",()=>{
  const narrow=measureImageStudioText({text:"iiii",bounds:{width:100,height:40},style:{font_size:20,line_height:1}});
  const wide=measureImageStudioText({text:"WWWW",bounds:{width:100,height:40},style:{font_size:20,line_height:1}});
  assert.ok(narrow.lineWidths[0]<wide.lineWidths[0]);
  assert.equal(narrow.overflow,false);
  assert.equal(wide.overflow,false);
});

test("letter spacing contributes between graphemes but not after the final grapheme",()=>{
  const base=measureImageStudioText({text:"AA",bounds:{width:100,height:40},style:{font_size:20,line_height:1,letter_spacing:0}});
  const spaced=measureImageStudioText({text:"AA",bounds:{width:100,height:40},style:{font_size:20,line_height:1,letter_spacing:5}});
  assert.equal(Math.round((spaced.lineWidths[0]-base.lineWidths[0])*1000)/1000,5);
});
