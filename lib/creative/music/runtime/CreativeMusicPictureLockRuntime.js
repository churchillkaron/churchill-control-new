import crypto from "node:crypto";

const CONTRACT="AVANTIQO_MUSIC_PICTURE_LOCK_V1";
function text(v){return String(v??"").trim();}
function finite(v,f=null){const n=Number(v);return Number.isFinite(n)?n:f;}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(!value||typeof value!=="object")return value;return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));}
function hash(value){return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");}

export function normalizeMusicFrameRate(value=24){const fps=finite(value,24);const supported=[23.976,24,25,29.97,30,48,50,59.94,60];const exact=supported.find(v=>Math.abs(v-fps)<.001);if(!exact)throw new Error(`CREATIVE_MUSIC_PICTURE_FRAME_RATE_UNSUPPORTED:${fps}`);return exact;}
export function musicSecondsToFrames(seconds,frameRate=24){return Math.max(0,Math.round(finite(seconds,0)*normalizeMusicFrameRate(frameRate)));}
export function musicFramesToSeconds(frames,frameRate=24){return Math.max(0,Math.round(finite(frames,0)))/normalizeMusicFrameRate(frameRate);}
export function musicFramesToSmpte(frames,frameRate=24){const fps=normalizeMusicFrameRate(frameRate),nominal=Math.round(fps),total=Math.max(0,Math.round(finite(frames,0)));const ff=total%nominal,totalSeconds=Math.floor(total/nominal),ss=totalSeconds%60,totalMinutes=Math.floor(totalSeconds/60),mm=totalMinutes%60,hh=Math.floor(totalMinutes/60);return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}:${String(ff).padStart(2,"0")}`;}
export function musicSecondsToSmpte(seconds,frameRate=24){return musicFramesToSmpte(musicSecondsToFrames(seconds,frameRate),frameRate);}

export function createMusicPictureLock(input={}){
 const frameRate=normalizeMusicFrameRate(input.frame_rate||input.fps||24),duration=finite(input.duration_seconds,null),assetId=text(input.picture_asset_id||input.video_asset_id),cutId=text(input.cut_id||input.timeline_id),sourceDigest=text(input.picture_digest||input.cut_digest||input.checksum);
 if(!assetId)throw new Error("CREATIVE_MUSIC_PICTURE_ASSET_REQUIRED");if(!cutId)throw new Error("CREATIVE_MUSIC_PICTURE_CUT_ID_REQUIRED");if(!sourceDigest)throw new Error("CREATIVE_MUSIC_PICTURE_DIGEST_REQUIRED");if(!Number.isFinite(duration)||duration<=0)throw new Error("CREATIVE_MUSIC_PICTURE_DURATION_REQUIRED");
 const basis={picture_asset_id:assetId,cut_id:cutId,picture_digest:sourceDigest,duration_seconds:Number(duration.toFixed(6)),frame_rate:frameRate,start_timecode:text(input.start_timecode)||"00:00:00:00"};
 return {contract:CONTRACT,...basis,frame_count:musicSecondsToFrames(duration,frameRate),picture_lock_digest:hash(basis),locked_at:text(input.locked_at)||new Date().toISOString(),audio_conform_required_on_picture_change:true,sync_tolerance_frames:1,exact_frame_clock:true,publication_requires_current_picture_lock:true};
}

export function bindMusicSessionToPicture(sessionInput={},pictureInput={}){const session=structuredClone(sessionInput),picture=createMusicPictureLock(pictureInput);session.picture_lock=picture;session.timeline={...(session.timeline||{}),timebase:"PICTURE_FRAMES",frame_rate:picture.frame_rate,picture_duration_seconds:picture.duration_seconds,picture_lock_digest:picture.picture_lock_digest,start_timecode:picture.start_timecode};return session;}
export function evaluateMusicPictureLock(session={},currentPicture={}){const stored=session.picture_lock;if(!stored)return{contract:"AVANTIQO_MUSIC_PICTURE_LOCK_STATUS_V1",status:"UNBOUND",current:false,reasons:["PICTURE_LOCK_MISSING"]};let current;try{current=createMusicPictureLock(currentPicture);}catch(error){return{contract:"AVANTIQO_MUSIC_PICTURE_LOCK_STATUS_V1",status:"UNVERIFIED",current:false,reasons:[error.message]};}const reasons=[];if(stored.picture_asset_id!==current.picture_asset_id)reasons.push("PICTURE_ASSET_CHANGED");if(stored.cut_id!==current.cut_id)reasons.push("PICTURE_CUT_CHANGED");if(stored.picture_digest!==current.picture_digest)reasons.push("PICTURE_DIGEST_CHANGED");if(Math.abs(finite(stored.duration_seconds)-current.duration_seconds)>.0005)reasons.push("PICTURE_DURATION_CHANGED");if(Math.abs(finite(stored.frame_rate)-current.frame_rate)>.0001)reasons.push("PICTURE_FRAME_RATE_CHANGED");return{contract:"AVANTIQO_MUSIC_PICTURE_LOCK_STATUS_V1",status:reasons.length?"STALE":"CURRENT",current:reasons.length===0,reasons,stored_picture_lock_digest:stored.picture_lock_digest,current_picture_lock_digest:current.picture_lock_digest,reconform_required:reasons.length>0};}

export const CreativeMusicPictureLockRuntime=Object.freeze({contract:CONTRACT,create:createMusicPictureLock,bind:bindMusicSessionToPicture,evaluate:evaluateMusicPictureLock,secondsToFrames:musicSecondsToFrames,framesToSeconds:musicFramesToSeconds,secondsToSmpte:musicSecondsToSmpte,framesToSmpte:musicFramesToSmpte});
