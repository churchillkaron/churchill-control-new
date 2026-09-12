import test from "node:test";
import assert from "node:assert/strict";
import { evaluateBenchmarkLab, evaluateBenchmarkDelta } from "../lib/creative/director/runtime/CreativeBenchmarkLabRuntime.js";

const analysis = Object.fromEntries(["narrative","editing","cinematography","visual_beauty","humanity","place","sound","production_craft"].map((k)=>[k,`Detailed ${k} study explains concrete choices, timing, causality and transferable craft without copying the reference execution.`]));
const lab = {
  contract:"CREATIVE_BENCHMARK_LAB_V1",
  studies:["Lamborghini","Ferrari","Volvo"].map((title,i)=>({title,source_ref:`reference:${i+1}`,analysis,craft_scores:Object.fromEntries(Object.keys(analysis).map(k=>[k,96]))})),
  craft_dna:{
    transferable_principles:Array.from({length:8},(_,i)=>`principle ${i+1}`),
    anti_copy_rules:["no shot copying","no branded composition copying","abstract craft only"],
    sound_principles:["dynamic range","diegetic causality","silence as structure"],
    editorial_principles:["duration contrast","earned cuts","payoff gets time"],
    cinematography_principles:["scale contrast","depth","motivated movement"],
  },
};
function strongPlan(){return {concept:{signature_images:[1,2,3,4,5]},story:{resolution:"A quiet physical alignment resolves into the brand through an authored practical transition."},scenes:[{location:{city:"Oslo",context:"harbour"},shots:[
{id:"1",duration_seconds:1.2,subject:"finger on cold metal",action:"A hand releases a latch and the machine state changes.",camera:{framing:"macro"},audio:{source_sound:"metal latch"}},
{id:"2",duration_seconds:5.5,subject:"ship and harbour",action:"A ship departs the harbour as wind moves across the water.",camera:{framing:"aerial wide"},audio:{source_sound:"harbour horn"}},
{id:"3",duration_seconds:2.1,subject:"worker",action:"A worker receives the manifest and turns toward the loading lane.",audio:{source_sound:"paper snap"}},
{id:"4",duration_seconds:6.4,subject:"port architecture",action:"Containers move through the port and complete a transfer.",audio:{source_sound:"gantry motor"}},
{id:"5",duration_seconds:0.9,subject:"eye",action:"An operator approves the release and the barrier opens.",camera:{framing:"extreme close-up"},audio:{source_sound:"relay click"}},
{id:"6",duration_seconds:7.2,subject:"city and rail",action:"A train departs through the city while rain changes reflections on the architecture.",camera:{framing:"aerial city"},audio:{source_sound:"rail resonance"}},
]}]};}

test("benchmark lab passes studied craft plus a non-generic high-contrast plan",()=>{const result=evaluateBenchmarkLab({plan:strongPlan(),benchmark_lab:lab}); assert.equal(result.passed,true,result.failures.join(","));});
test("benchmark delta blocks corporate explainer repetition and generic glowing-map reveal",()=>{const plan={concept:{signature_images:[]},story:{resolution:"A luminous wave crosses a global map and forms the logo."},scenes:[{location:{city:"Berlin",context:"office"},shots:Array.from({length:8},(_,i)=>({id:String(i),duration_seconds:4,subject:"screen",action:"Employee types on dashboard showing Quarterly Report Q3 2026",audio:{source_sound:"keyboard click"}}))}]}; const result=evaluateBenchmarkDelta({plan,benchmark_lab:lab}); assert.equal(result.passed,false); for(const code of ["EXPLAINER_DENSITY_TOO_HIGH","SCALE_CONTRAST_TOO_LOW","GENERIC_TECH_REVEAL","BEAUTY_HERO_SHOT_DEFICIT"]) assert.ok(result.failures.includes(code),`${code} missing`);});
