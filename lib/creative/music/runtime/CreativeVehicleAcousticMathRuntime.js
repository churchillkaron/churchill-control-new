const CONTRACT="AVANTIQO_VEHICLE_ACOUSTIC_MATH_V1";
const NOTES=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
function finite(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f;}
export function vehicleNoteForHz(hz){if(!(hz>0))return null;const midi=Math.round(69+12*Math.log2(hz/440)),name=NOTES[((midi%12)+12)%12],octave=Math.floor(midi/12)-1,cents=Math.round(1200*Math.log2(hz/(440*2**((midi-69)/12))));return{midi,note:`${name}${octave}`,pitch_class:name,cents};}
export function firingFrequencyFromRpm({rpm,cylinders,strokes=4}={}){const r=Math.max(0,finite(rpm,0)),c=Math.max(1,Math.round(finite(cylinders,1))),s=Number(strokes)===2?2:4;return r/60*c/(s/2);}
export function mapVehicleRpmToPitch(input={}){const fundamental_hz=firingFrequencyFromRpm(input),note=vehicleNoteForHz(fundamental_hz);return{contract:"AVANTIQO_VEHICLE_RPM_PITCH_MAP_V1",rpm:finite(input.rpm,0),cylinders:Math.max(1,Math.round(finite(input.cylinders,1))),strokes:Number(input.strokes)===2?2:4,fundamental_hz:Number(fundamental_hz.toFixed(4)),...note,physics_model:"COMBUSTION_EVENT_RATE",measured_audio_required_for_exact_engine_pitch:true};}
export const CreativeVehicleAcousticMathRuntime=Object.freeze({contract:CONTRACT,noteForHz:vehicleNoteForHz,firingFrequency:firingFrequencyFromRpm,rpmPitch:mapVehicleRpmToPitch});
