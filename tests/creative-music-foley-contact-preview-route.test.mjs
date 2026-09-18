import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("multitrack route exposes non-mutating Foley contact preview before bind",()=>{const route=fs.readFileSync("app/api/creative/music/multitrack/route.js","utf8");assert.match(route,/preview_foley_contacts/);assert.match(route,/derivePictureContactEvidence/);assert.match(route,/proposeMusicPictureFoleyCues/);assert.match(route,/endpoint_mutation_performed:false/);assert.match(route,/human_approval_required:true/);assert.match(route,/bind_foley_asset/);});
